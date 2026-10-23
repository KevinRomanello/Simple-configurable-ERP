import { areaSheet, netCents, type AreaSheet, type Phase } from "@erp/calc";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { toCents, toScaled } from "../../core/money";
import { LIMITS } from "../../core/validation";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { area, budgetLine, fund, lineFigures, lineFund, project } from "../../db/schema";
import { loadSnapshot } from "../../snapshot";
import { canWrite, getCurrentUser, type User } from "../auth/auth.service";
import { listCategories, listVatRates } from "../lookups/lookups.service";
import { getCurrentSeason } from "../seasons/seasons.service";
import type { CreateLineInput, FiguresInput, UpdateLineInput } from "./budget.schema";

/** The areas, in the order of the old sheet tabs (GET /api/areas). */
export async function listAreas() {
  return db.select().from(area).orderBy(asc(area.position));
}

/** One area as the old area sheets showed it (GET /api/areas/:code/sheet). */
export async function getAreaSheet(areaCode: string): Promise<AreaSheet> {
  const snapshot = await loadSnapshot();
  if (!snapshot.areas.some((a) => a.code === areaCode)) throw notFound(`Area "${areaCode}"`);
  return areaSheet(snapshot, areaCode);
}

// --- writes ------------------------------------------------------------------------------------

async function assertCanWrite(actor: User, areaId: number) {
  if (!(await canWrite(actor, areaId))) throw forbidden("You cannot change this area");
}

async function checkCategory(category: string | null | undefined) {
  if (category == null) return;
  if (!(await listCategories()).includes(category)) throw invalid(`Unknown category "${category}"`);
}

/** Adds a project at the end of an area ("Add New Project" of the old sheet). */
export async function createProject(input: { areaCode: string; name: string; ownerName?: string | null }) {
  const actor = await getCurrentUser();
  const season = await getCurrentSeason();
  return runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(area).where(eq(area.code, input.areaCode));
    if (!target) throw notFound(`Area "${input.areaCode}"`);
    await assertCanWrite(actor, target.id);
    // Two projects added at the same moment must not get the same position: take turns on the area.
    await tx.select({ id: area.id }).from(area).where(eq(area.id, target.id)).for("update");
    const [last] = await tx
      .select({ position: sql<number>`coalesce(max(${project.position}), 0)::int` })
      .from(project)
      .where(and(eq(project.seasonId, season.id), eq(project.areaId, target.id)));
    const [created] = await tx
      .insert(project)
      .values({
        seasonId: season.id,
        areaId: target.id,
        name: input.name,
        ownerName: input.ownerName ?? null,
        position: (last?.position ?? 0) + 1,
      })
      .returning();
    return created!;
  });
}

async function projectOf(tx: Tx, projectId: number) {
  const [found] = await tx.select().from(project).where(eq(project.id, projectId));
  if (!found) throw notFound("Project");
  return found;
}

export async function updateProject(projectId: number, input: { name?: string; ownerName?: string | null }) {
  const actor = await getCurrentUser();
  return runWrite(actor, async (tx) => {
    await assertCanWrite(actor, (await projectOf(tx, projectId)).areaId);
    const [updated] = await tx.update(project).set(input).where(eq(project.id, projectId)).returning();
    return updated!;
  });
}

/** Deletes a project with all its lines. */
export async function deleteProject(projectId: number) {
  const actor = await getCurrentUser();
  await runWrite(actor, async (tx) => {
    await assertCanWrite(actor, (await projectOf(tx, projectId)).areaId);
    await tx.delete(project).where(eq(project.id, projectId));
  });
}

/**
 * Applies a partial change to the figures of one phase of a line, creating them if needed, and
 * checks the rules that depend on the combined result (VAT rate list, partial sponsor range).
 */
async function saveFigures(tx: Tx, lineId: number, phase: Phase, patch: FiguresInput) {
  const [current] = await tx
    .select()
    .from(lineFigures)
    .where(and(eq(lineFigures.lineId, lineId), eq(lineFigures.phase, phase)));

  const merged = {
    quantity: patch.quantity ?? current?.quantity ?? "0",
    unitNetCost: patch.unitNetCost ?? current?.unitNetCost ?? "0",
    sponsorType: patch.sponsorType !== undefined ? patch.sponsorType : (current?.sponsorType ?? null),
    sponsorValue: patch.sponsorValue !== undefined ? patch.sponsorValue : (current?.sponsorValue ?? null),
    vatRate:
      patch.vatRate !== undefined ? patch.vatRate : current?.vatRate == null ? null : Number(current.vatRate),
    supplierId: patch.supplierId !== undefined ? patch.supplierId : (current?.supplierId ?? null),
    purchaseDate: patch.purchaseDate !== undefined ? patch.purchaseDate : (current?.purchaseDate ?? null),
    arrivalDate: patch.arrivalDate !== undefined ? patch.arrivalDate : (current?.arrivalDate ?? null),
  };

  if (merged.vatRate !== null && !(await listVatRates()).includes(merged.vatRate)) {
    throw invalid(`VAT rate ${merged.vatRate}% is not one of the allowed rates`);
  }
  // quantity and unit cost are each limited on their own; together they must stay within the range
  // the calculations can add up exactly
  const net = netCents(toScaled(merged.quantity, 3), toScaled(merged.unitNetCost, 4));
  if (net > LIMITS.netCost * 100) {
    throw invalid(`The net cost of a line cannot be more than ${LIMITS.netCost.toLocaleString("en-US")} euros`);
  }
  if (merged.sponsorType === "partial" && merged.sponsorValue !== null) {
    const sponsor = toCents(merged.sponsorValue);
    if (sponsor <= 0 || sponsor > net) {
      throw invalid("A partial sponsor must be above zero and at most the net cost of the line");
    }
  }
  // Only a partial sponsor has a typed value; the other types derive it.
  if (merged.sponsorType !== "partial") merged.sponsorValue = null;

  const values = {
    ...merged,
    vatRate: merged.vatRate === null ? null : merged.vatRate.toFixed(2),
  };
  const [saved] = await tx
    .insert(lineFigures)
    .values({ lineId, phase, ...values })
    .onConflictDoUpdate({ target: [lineFigures.lineId, lineFigures.phase], set: values })
    .returning({ id: lineFigures.id });
  if (patch.fundIds !== undefined) await saveFunds(tx, saved!.id, patch.fundIds);
}

/**
 * Replaces the funds that pay a line. They must work together: several funds only if they are in
 * the same group, never the team fund together with others (the team's own money cannot make up
 * for a fund that is not enough), a gift only alone (it covers everything) and never a sponsor
 * whose money goes into the bank.
 */
async function saveFunds(tx: Tx, figuresId: number, ids: number[]) {
  const found = ids.length > 0 ? await tx.select().from(fund).where(inArray(fund.id, ids)) : [];
  if (new Set(ids).size !== ids.length) throw invalid("The same fund is chosen twice");
  const chosen = ids.map((id) => {
    const row = found.find((f) => f.id === id);
    if (!row) throw conflict(`Fund ${id} does not exist`);
    return row;
  });

  for (const [index, f] of chosen.entries()) {
    if (f.mode === "cash") throw invalid(`"${f.name}" pays into the bank: its money is the team's, pay from the team fund`);
    if (f.kind === "external" && f.type !== "fund" && chosen.length > 1) {
      throw invalid(`"${f.name}" covers the whole line: it cannot be combined with other funds`);
    }
    if (f.kind === "team" && chosen.length > 1) {
      throw invalid("The team's own money cannot make up for a fund that is not enough: add another fund of the same group");
    }
    const first = chosen[0]!;
    if (index > 0 && f.kind === "external") {
      const sameGroup = first.groupName !== null && first.groupName.toLowerCase() === f.groupName?.toLowerCase();
      if (!sameGroup) throw invalid(`"${first.name}" and "${f.name}" cannot pay together: they are not in the same group`);
    }
  }

  await tx.delete(lineFund).where(eq(lineFund.figuresId, figuresId));
  if (chosen.length > 0) {
    await tx.insert(lineFund).values(chosen.map((f, index) => ({ figuresId, position: index + 1, fundId: f.id })));
  }
}

async function saveAllFigures(tx: Tx, lineId: number, figures: CreateLineInput["figures"]) {
  for (const phase of ["estimate", "actual"] as const) {
    const patch = figures?.[phase];
    if (patch) await saveFigures(tx, lineId, phase, patch);
  }
}

/** Adds a line at the end of a project. */
export async function createLine(projectId: number, input: CreateLineInput) {
  const actor = await getCurrentUser();
  await checkCategory(input.category);
  return runWrite(actor, async (tx) => {
    await assertCanWrite(actor, (await projectOf(tx, projectId)).areaId);
    // Same as for projects: lines added at the same moment take turns on their project.
    await tx.select({ id: project.id }).from(project).where(eq(project.id, projectId)).for("update");
    const [last] = await tx
      .select({ position: sql<number>`coalesce(max(${budgetLine.position}), 0)::int` })
      .from(budgetLine)
      .where(eq(budgetLine.projectId, projectId));
    const [created] = await tx
      .insert(budgetLine)
      .values({
        projectId,
        position: (last?.position ?? 0) + 1,
        item: input.item,
        category: input.category ?? null,
        priority: input.priority ?? null,
        note: input.note ?? null,
      })
      .returning();
    await saveAllFigures(tx, created!.id, input.figures);
    return created!;
  });
}

async function lineWithArea(tx: Tx, lineId: number) {
  const [found] = await tx
    .select({ line: budgetLine, areaId: project.areaId })
    .from(budgetLine)
    .innerJoin(project, eq(budgetLine.projectId, project.id))
    .where(eq(budgetLine.id, lineId));
  if (!found) throw notFound("Line");
  return found;
}

/**
 * Changes a line. `version` must be the one the caller read: if someone else changed the line in
 * the meantime the write is refused (409) instead of silently overwriting their work.
 */
export async function updateLine(lineId: number, input: UpdateLineInput) {
  const actor = await getCurrentUser();
  await checkCategory(input.category);
  return runWrite(actor, async (tx) => {
    const { areaId } = await lineWithArea(tx, lineId);
    await assertCanWrite(actor, areaId);

    const { version, figures, ...fields } = input;
    const [updated] = await tx
      .update(budgetLine)
      .set({ ...fields, version: sql`${budgetLine.version} + 1` })
      .where(and(eq(budgetLine.id, lineId), eq(budgetLine.version, version)))
      .returning();
    if (!updated) throw conflict("This line was changed by someone else: reload it and try again");

    await saveAllFigures(tx, lineId, figures);
    return updated;
  });
}

export async function deleteLine(lineId: number) {
  const actor = await getCurrentUser();
  await runWrite(actor, async (tx) => {
    await assertCanWrite(actor, (await lineWithArea(tx, lineId)).areaId);
    await tx.delete(budgetLine).where(eq(budgetLine.id, lineId));
  });
}
