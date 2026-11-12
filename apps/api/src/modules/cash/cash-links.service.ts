import { computeLines, toPayLines, type CalcLine } from "@erp/calc";
import { and, desc, eq, gte, inArray, isNotNull, lt, lte, notExists, sql } from "drizzle-orm";
import { invalid, notFound } from "../../core/errors";
import { fromCents, toCents } from "../../core/money";
import { today } from "../../core/today";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, cashEntry, cashEntryLine, category, project } from "../../db/schema";
import { loadSnapshot } from "../../snapshot";
import { allSeasons, assertSeasonOpen, getCurrentSeason, getSeasonById } from "../seasons/seasons.service";
import type { PayInput } from "./cash.schema";
import { assertCanManageCash, insertEntry } from "./cash.service";

// The payments of the register tied to the lines of the budget (docs/registro-di-cassa.md, section 5.3): a
// payment can cover several lines, and a line can be paid in instalments. A payment covers what the team pays
// for a line: the net out of its fund first, then the VAT.

type Season = { id: number; startsOn: string; endsOn: string };

export interface PayableLine {
  lineId: number;
  item: string;
  project: string;
  /** What the team pays of the line (ACTUAL): the net out of its fund, and the VAT. */
  teamFundCents: number;
  teamVatCents: number;
  /** The two together: the most a payment can cover. */
  totalCents: number;
  /** What every payment has paid of it, this one included. */
  paidCents: number;
}

const linesOf = async (season: Season) => computeLines(await loadSnapshot(season));

const payableOf = (l: CalcLine): PayableLine => ({
  lineId: l.id,
  item: l.item,
  project: l.projectName,
  teamFundCents: l.actual.teamFundCents,
  teamVatCents: l.actual.teamVatCents,
  totalCents: l.actual.teamFundCents + l.actual.teamVatCents,
  paidCents: l.actual.paidCents,
});

/** The ACTUAL lines of the season that the team pays for (the only ones a payment can be tied to), with how much is paid. */
export async function listPayableLines(): Promise<PayableLine[]> {
  await assertCanManageCash();
  return (await linesOf(await getCurrentSeason())).map(payableOf).filter((l) => l.totalCents > 0);
}

/** A payment never covers more of a line than the team pays for it, with the other payments of the line. */
function assertFits(line: PayableLine | undefined, othersCents: number, cents: number) {
  if (!line || line.totalCents <= 0) throw invalid("A payment can only be tied to a line that the team pays for (ACTUAL)");
  if (othersCents + cents > line.totalCents) throw invalid(`The payments of "${line.item}" cannot exceed what the team pays for it`);
}

/** The amounts of a request, by line: above zero, each line once. */
function amountsOf(lines: { lineId: number; amount: string }[]): Map<number, number> {
  const wanted = new Map<number, number>();
  for (const l of lines) {
    if (wanted.has(l.lineId)) throw invalid("A line can be listed only once");
    const cents = toCents(l.amount);
    if (cents <= 0) throw invalid("Every amount must be above zero");
    wanted.set(l.lineId, cents);
  }
  return wanted;
}

/**
 * Sets which lines of the budget a payment paid and how much of each: the links of the season chosen
 * in the menu are replaced, those of other seasons stay. The lines are the ACTUAL ones the team pays for;
 * the payments of a line never exceed that, and a payment never covers more than it is.
 */
export async function setEntryLines(entryId: number, lines: { lineId: number; amount: string }[]) {
  const actor = await assertCanManageCash();
  const season = await getCurrentSeason();
  const payable = new Map((await linesOf(season)).map((l) => [l.id, payableOf(l)]));
  return runWrite(actor, async (tx) => {
    await assertSeasonOpen(tx, season.id);
    const [entry] = await tx.select().from(cashEntry).where(eq(cashEntry.id, entryId)).for("update");
    if (!entry) throw notFound("Movement");
    const outCents = -toCents(entry.amount);
    if (outCents <= 0) throw invalid("Only a payment (money out) can be tied to budget lines");

    const wanted = amountsOf(lines);
    for (const [lineId, cents] of wanted) {
      // what the other payments paid of it, so that this one does not take it above what the team pays
      const [others] = await tx
        .select({ amount: sql<string | null>`sum(${cashEntryLine.amount})` })
        .from(cashEntryLine)
        .where(and(eq(cashEntryLine.lineId, lineId), sql`${cashEntryLine.entryId} <> ${entryId}`));
      assertFits(payable.get(lineId), others?.amount == null ? 0 : toCents(others.amount), cents);
    }
    // the part of this payment that stays in other seasons counts against the movement too
    const [elsewhere] = await tx
      .select({ amount: sql<string | null>`sum(${cashEntryLine.amount})` })
      .from(cashEntryLine)
      .innerJoin(budgetLine, eq(cashEntryLine.lineId, budgetLine.id))
      .innerJoin(project, eq(budgetLine.projectId, project.id))
      .where(and(eq(cashEntryLine.entryId, entryId), sql`${project.seasonId} <> ${season.id}`));
    const total = [...wanted.values()].reduce((sum, c) => sum + c, 0) + (elsewhere?.amount == null ? 0 : toCents(elsewhere.amount));
    if (total > outCents) throw invalid("The lines add up to more than the payment");

    const inSeason = (
      await tx
        .select({ id: cashEntryLine.id })
        .from(cashEntryLine)
        .innerJoin(budgetLine, eq(cashEntryLine.lineId, budgetLine.id))
        .innerJoin(project, eq(budgetLine.projectId, project.id))
        .where(and(eq(cashEntryLine.entryId, entryId), eq(project.seasonId, season.id)))
    ).map((r) => r.id);
    if (inSeason.length > 0) await tx.delete(cashEntryLine).where(inArray(cashEntryLine.id, inSeason));
    if (wanted.size > 0) {
      await tx.insert(cashEntryLine).values([...wanted].map(([lineId, cents]) => ({ entryId, lineId, amount: fromCents(cents) })));
    }
  });
}

// --- TO PAY ------------------------------------------------------------------------------------

/**
 * What the team still has to pay of the lines bought (the page TO PAY): the lines of the season chosen in the
 * menu, or of every season; with the Voce each category starts from and the method of the last payment, for the
 * form that pays them.
 */
export async function listToPay(everySeason: boolean) {
  await assertCanManageCash();
  const seasons = everySeason ? await allSeasons() : [await getCurrentSeason()];
  const voceOf = new Map((await db.select({ name: category.name, voceId: category.defaultVoceId }).from(category)).map((c) => [c.name.toLowerCase(), c.voceId]));
  const rows = [];
  for (const season of seasons) {
    for (const row of toPayLines(await linesOf(season), today())) {
      rows.push({ ...row, seasonId: season.id, seasonName: season.name, suggestedCategoryId: row.category ? (voceOf.get(row.category.toLowerCase()) ?? null) : null });
    }
  }
  const [last] = await db
    .select({ methodId: cashEntry.methodId })
    .from(cashEntry)
    .where(and(lt(cashEntry.amount, "0"), isNotNull(cashEntry.methodId)))
    .orderBy(desc(cashEntry.entryOn), desc(cashEntry.id))
    .limit(1);
  return { rows, lastMethodId: last?.methodId ?? null };
}

/**
 * Pays lines of the budget: one new movement of money out, as much as the lines add up to, tied to each of them
 * (one bank transfer can pay several lines of a supplier). All or nothing. A line can be paid in part, but never
 * more than the team still owes for it.
 */
export async function payLines(input: PayInput) {
  const actor = await assertCanManageCash();
  const wanted = amountsOf(input.lines);

  // the seasons of the lines, and what the team owes for each
  const found = await db
    .select({ lineId: budgetLine.id, seasonId: project.seasonId })
    .from(budgetLine)
    .innerJoin(project, eq(budgetLine.projectId, project.id))
    .where(inArray(budgetLine.id, [...wanted.keys()]));
  if (found.length !== wanted.size) throw notFound("Line");
  const seasonIds = [...new Set(found.map((f) => f.seasonId))];
  const payable = new Map<number, PayableLine>();
  for (const seasonId of seasonIds) {
    for (const l of await linesOf(await getSeasonById(seasonId))) payable.set(l.id, payableOf(l));
  }

  return runWrite(actor, async (tx: Tx) => {
    for (const seasonId of seasonIds) await assertSeasonOpen(tx, seasonId);
    let total = 0;
    for (const [lineId, cents] of wanted) {
      const line = payable.get(lineId);
      assertFits(line, line?.paidCents ?? 0, cents);
      total += cents;
    }
    const items = [...wanted.keys()].map((id) => payable.get(id)!.item);
    const entry = await insertEntry(tx, {
      on: input.on,
      description: input.description?.trim() || items.join(", ").slice(0, 500),
      categoryId: input.categoryId,
      methodId: input.methodId,
      account: input.account,
      direction: "out",
      amount: fromCents(total),
      invoiceChecked: false,
      sponsorship: false,
    });
    await tx.insert(cashEntryLine).values([...wanted].map(([lineId, cents]) => ({ entryId: entry.id, lineId, amount: fromCents(cents) })));
    return entry;
  });
}

/** The payments of the season chosen in the menu that pay no line yet, newest first: the ones the page TO PAY offers to tie. */
export async function listToLink() {
  await assertCanManageCash();
  const season = await getCurrentSeason();
  const rows = await db
    .select()
    .from(cashEntry)
    .where(
      and(
        lt(cashEntry.amount, "0"),
        gte(cashEntry.entryOn, season.startsOn),
        lte(cashEntry.entryOn, season.endsOn),
        notExists(db.select({ one: sql`1` }).from(cashEntryLine).where(eq(cashEntryLine.entryId, cashEntry.id))),
      ),
    )
    .orderBy(desc(cashEntry.entryOn), desc(cashEntry.id))
    .limit(300);
  return rows.map((e) => ({ id: e.id, on: e.entryOn, description: e.description, account: e.account, cents: toCents(e.amount), categoryId: e.categoryId, methodId: e.methodId, lines: [] }));
}
