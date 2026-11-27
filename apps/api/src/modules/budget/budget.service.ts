import { areaSheet, computeLines, grossCents, netCents, type AreaSheet, type CalcLine, type Phase } from "@erp/calc";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../../core/contracts";
import { anyOf } from "../../core/sql";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { toCents, toScaled } from "../../core/money";
import { LIMITS } from "../../core/validation";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, fund, lineFigures, lineFund, project, supplier } from "../../db/schema/budget";
import { area } from "../../db/schema/platform";
import { loadSnapshot } from "../../snapshot";
import { canWrite, getCurrentUser, type User } from "../../platform/auth/auth.service";
import { getDefaultVatRate, listCategories, listVatRates } from "../../platform/lookups/lookups.service";
import { assertCarExists, assertSeasonOpen, getCurrentSeason } from "../../platform/seasons/seasons.service";
import { ensureSupplier } from "../suppliers/suppliers.service";
import type { CreateLineInput, FiguresInput, UpdateLineInput } from "./budget.schema";

/** One area as the old area sheets showed it (GET /api/areas/:code/sheet). */
export async function getAreaSheet(areaCode: string): Promise<AreaSheet> {
  const snapshot = await loadSnapshot();
  if (!snapshot.areas.some((a) => a.code === areaCode)) throw notFound(`Area "${areaCode}"`);
  return areaSheet(snapshot, areaCode);
}

/** The lines of a season as the calculation sees them (what the bridge to the treasury builds TO PAY and the payments of lines on). */
export async function computedLines(season: { id: number; startsOn: string; endsOn: string }): Promise<CalcLine[]> {
  return computeLines(await loadSnapshot(season));
}

/** A season as the calculation sees it: its lines, its projects and the areas (the statistics of the inventory and its choice of projects). */
export async function computedSeason(season: { id: number; startsOn: string; endsOn: string }) {
  const snapshot = await loadSnapshot(season);
  return {
    lines: computeLines(snapshot),
    /** The projects of the derived area (ADMINISTRATION) are here too, with negative ids: they are not rows of the database. */
    projects: snapshot.projects.map((p) => ({ id: p.id, name: p.name, areaId: p.areaId })),
    areas: snapshot.areas.map((a) => ({ id: a.id, code: a.code, name: a.name })),
  };
}

/** The projects with these ids, with their names (the ones that exist). */
export async function projectsByIds(reader: Db, ids: number[]): Promise<{ id: number; name: string }[]> {
  if (ids.length === 0) return [];
  return reader.select({ id: project.id, name: project.name }).from(project).where(anyOf(project.id, ids));
}

/** The car each of these lines is for: the one chosen on the line, or the season of its project. */
export async function lineCars(reader: Db, lineIds: number[]): Promise<Map<number, number>> {
  if (lineIds.length === 0) return new Map();
  const rows = await reader
    .select({ id: budgetLine.id, car: sql<number>`coalesce(${budgetLine.carSeasonId}, ${project.seasonId})` })
    .from(budgetLine)
    .innerJoin(project, eq(budgetLine.projectId, project.id))
    .where(anyOf(budgetLine.id, lineIds));
  return new Map(rows.map((r) => [r.id, r.car]));
}

/** The projects of a season with their area: the choice of a project in the forms of the inventory. */
export async function projectsOfSeason(reader: Db, seasonId: number): Promise<{ id: number; name: string; areaCode: string; areaName: string }[]> {
  return reader
    .select({ id: project.id, name: project.name, areaCode: area.code, areaName: area.name })
    .from(project)
    .innerJoin(area, eq(project.areaId, area.id))
    .where(eq(project.seasonId, seasonId));
}

/** Keeps a line from changing until the transaction ends: two arrivals of the same purchase take turns. False if there is no such line. */
export async function lockLine(tx: Tx, lineId: number): Promise<boolean> {
  const [locked] = await tx.select({ id: budgetLine.id }).from(budgetLine).where(eq(budgetLine.id, lineId)).for("update");
  return locked !== undefined;
}

/** The season each of these lines is in, by line (a line that does not exist is not there). */
export async function seasonsOfLines(reader: Db, lineIds: number[]): Promise<Map<number, number>> {
  if (lineIds.length === 0) return new Map();
  const rows = await reader.select({ id: budgetLine.id, seasonId: project.seasonId }).from(budgetLine).innerJoin(project, eq(budgetLine.projectId, project.id)).where(anyOf(budgetLine.id, lineIds));
  return new Map(rows.map((r) => [r.id, r.seasonId]));
}

/** The name (the item) of each of these lines, by line. */
export async function lineLabels(reader: Db, lineIds: number[]): Promise<Map<number, string>> {
  if (lineIds.length === 0) return new Map();
  const rows = await reader.select({ id: budgetLine.id, item: budgetLine.item }).from(budgetLine).where(anyOf(budgetLine.id, lineIds));
  return new Map(rows.map((r) => [r.id, r.item]));
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
    if (target.derived) throw forbidden("This area is calculated from the register: change the movements there");
    await assertCanWrite(actor, target.id);
    await assertSeasonOpen(tx, season.id);
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

/** A project that the actor may change, in a season that is not read-only. */
async function writableProject(tx: Tx, actor: User, projectId: number) {
  const [found] = await tx.select().from(project).where(eq(project.id, projectId));
  if (!found) throw notFound("Project");
  await assertCanWrite(actor, found.areaId);
  await assertSeasonOpen(tx, found.seasonId);
  return found;
}

export async function updateProject(projectId: number, input: { name?: string; ownerName?: string | null }) {
  const actor = await getCurrentUser();
  return runWrite(actor, async (tx) => {
    await writableProject(tx, actor, projectId);
    const [updated] = await tx.update(project).set(input).where(eq(project.id, projectId)).returning();
    return updated!;
  });
}

/** Deletes a project with all its lines. */
export async function deleteProject(projectId: number) {
  const actor = await getCurrentUser();
  await runWrite(actor, async (tx) => {
    await writableProject(tx, actor, projectId);
    await tx.delete(project).where(eq(project.id, projectId));
  });
}

/**
 * A sponsor that gives goods is also the supplier of them (docs/sponsor-e-fondi.md): choosing it as
 * the fund of a phase also chooses it as the supplier, and choosing that supplier also chooses the
 * sponsor as the fund, replacing what was there. Only what is not in the patch is filled in.
 */
async function withGoodsSponsor(tx: Tx, patch: FiguresInput): Promise<FiguresInput> {
  if (patch.fundIds?.length === 1 && patch.supplierId === undefined) {
    const [sponsor] = await tx
      .select()
      .from(fund)
      .where(and(eq(fund.id, patch.fundIds[0]!), eq(fund.kind, "external"), ne(fund.type, "fund")));
    if (sponsor) return { ...patch, supplierId: (await ensureSupplier(tx, sponsor.name)).id };
  }
  if (patch.supplierId != null && patch.fundIds === undefined) {
    const season = await getCurrentSeason();
    const [sponsor] = await tx
      .select({ id: fund.id })
      .from(fund)
      .innerJoin(supplier, sql`lower(${supplier.name}) = lower(${fund.name})`)
      .where(and(eq(supplier.id, patch.supplierId), eq(fund.seasonId, season.id), eq(fund.kind, "external"), ne(fund.type, "fund")));
    if (sponsor) return { ...patch, fundIds: [sponsor.id] };
  }
  return patch;
}

/**
 * Applies a partial change to the figures of one phase of a line, creating them if needed, and
 * checks the rules that depend on the combined result (VAT rate list, partial sponsor range).
 *
 * The price is typed either without VAT (`unitNetCost`) or with it (`unitGrossCost`): the one sent is
 * the one kept, and the other is worked out when the line is read (docs/prezzo-lordo.md). A price
 * with VAT needs a rate and a sponsor type to be worked out: when they are missing the line starts
 * from the main rate and from "no sponsor", which the person can change.
 */
async function saveFigures(tx: Tx, lineId: number, phase: Phase, change: FiguresInput) {
  if (phase === "actual" && change.arrivalDate !== undefined) {
    throw invalid("The arrival date of ACTUAL is not typed: it is the day of the last arrival registered in PENDING");
  }
  const patch = await withGoodsSponsor(tx, change);
  const [current] = await tx
    .select()
    .from(lineFigures)
    .where(and(eq(lineFigures.lineId, lineId), eq(lineFigures.phase, phase)));

  if (patch.unitNetCost !== undefined && patch.unitGrossCost !== undefined) {
    throw invalid("Type the price either without VAT or with it, not both");
  }
  // the price kept: the one typed now, or the one the line already had
  const unitGrossCost = patch.unitGrossCost ?? (patch.unitNetCost !== undefined ? null : (current?.unitGrossCost ?? null));
  const merged = {
    quantity: patch.quantity ?? current?.quantity ?? "0",
    unitNetCost: unitGrossCost !== null ? "0" : (patch.unitNetCost ?? current?.unitNetCost ?? "0"),
    unitGrossCost,
    sponsorType: patch.sponsorType !== undefined ? patch.sponsorType : (current?.sponsorType ?? null),
    sponsorValue: patch.sponsorValue !== undefined ? patch.sponsorValue : (current?.sponsorValue ?? null),
    vatRate:
      patch.vatRate !== undefined ? patch.vatRate : current?.vatRate == null ? null : Number(current.vatRate),
    supplierId: patch.supplierId !== undefined ? patch.supplierId : (current?.supplierId ?? null),
    purchaseDate: patch.purchaseDate !== undefined ? patch.purchaseDate : (current?.purchaseDate ?? null),
    arrivalDate: patch.arrivalDate !== undefined ? patch.arrivalDate : (current?.arrivalDate ?? null),
  };

  if (merged.unitGrossCost !== null) {
    if (merged.sponsorType === "partial") throw invalid("A partial sponsor needs the price without VAT: type the net price");
    merged.sponsorType ??= "none";
    merged.vatRate ??= await getDefaultVatRate();
  }
  if (merged.vatRate !== null && !(await listVatRates()).includes(merged.vatRate)) {
    throw invalid(`VAT rate ${merged.vatRate}% is not one of the allowed rates`);
  }
  // quantity and unit cost are each limited on their own; together they must stay within the range
  // the calculations can add up exactly
  const quantityMilli = toScaled(merged.quantity, 3);
  const net = netCents(quantityMilli, toScaled(merged.unitNetCost, 4));
  const gross = merged.unitGrossCost === null ? 0 : grossCents(quantityMilli, toScaled(merged.unitGrossCost, 4));
  if (net > LIMITS.netCost * 100) {
    throw invalid(`The net cost of a line cannot be more than ${LIMITS.netCost.toLocaleString("en-US")} euros`);
  }
  if (gross > LIMITS.netCost * 100) {
    throw invalid(`The cost of a line cannot be more than ${LIMITS.netCost.toLocaleString("en-US")} euros`);
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
  if (patch.fundIds !== undefined) await saveFunds(tx, saved!.id, patch.fundIds, phase);
}

/**
 * Replaces the funds that pay a line. They must work together: several funds only if they are in
 * the same group, never the team fund together with others (the team's own money cannot make up
 * for a fund that is not enough), a gift only alone (it covers everything) and never a sponsor
 * whose money goes into the bank.
 */
async function saveFunds(tx: Tx, figuresId: number, ids: number[], phase: Phase) {
  const found = ids.length > 0 ? await tx.select().from(fund).where(inArray(fund.id, ids)) : [];
  if (new Set(ids).size !== ids.length) throw invalid("The same fund is chosen twice");
  const chosen = ids.map((id) => {
    const row = found.find((f) => f.id === id);
    if (!row) throw conflict(`Fund ${id} does not exist`);
    return row;
  });

  for (const [index, f] of chosen.entries()) {
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

/** The car of a line as it is stored: the car of its own season is no choice (null), like automatic. */
async function carOf(tx: Tx, carSeasonId: number | null | undefined, ownSeasonId: number) {
  await assertCarExists(tx, carSeasonId);
  return carSeasonId === ownSeasonId ? null : carSeasonId;
}

/** Adds a line at the end of a project. */
export async function createLine(projectId: number, input: CreateLineInput) {
  const actor = await getCurrentUser();
  await checkCategory(input.category);
  return runWrite(actor, async (tx) => {
    const target = await writableProject(tx, actor, projectId);
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
        brand: input.brand ?? null,
        model: input.model ?? null,
        category: input.category ?? null,
        priority: input.priority ?? null,
        note: input.note ?? null,
        carSeasonId: (await carOf(tx, input.carSeasonId, target.seasonId)) ?? null,
      })
      .returning();
    await saveAllFigures(tx, created!.id, input.figures);
    return created!;
  });
}

/** A line that the actor may change, in a season that is not read-only; with the season it is in. */
async function writableLine(tx: Tx, actor: User, lineId: number) {
  const [found] = await tx
    .select({ areaId: project.areaId, seasonId: project.seasonId })
    .from(budgetLine)
    .innerJoin(project, eq(budgetLine.projectId, project.id))
    .where(eq(budgetLine.id, lineId));
  if (!found) throw notFound("Line");
  await assertCanWrite(actor, found.areaId);
  await assertSeasonOpen(tx, found.seasonId);
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
    const { seasonId } = await writableLine(tx, actor, lineId);

    const { version, figures, carSeasonId, ...fields } = input;
    const car = carSeasonId === undefined ? {} : { carSeasonId: await carOf(tx, carSeasonId, seasonId) };
    const [updated] = await tx
      .update(budgetLine)
      .set({ ...fields, ...car, version: sql`${budgetLine.version} + 1` })
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
    await writableLine(tx, actor, lineId);
    await tx.delete(budgetLine).where(eq(budgetLine.id, lineId));
  });
}
