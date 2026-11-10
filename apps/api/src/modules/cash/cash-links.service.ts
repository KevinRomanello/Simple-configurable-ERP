import { computeLines } from "@erp/calc";
import { and, eq, inArray, sql } from "drizzle-orm";
import { invalid, notFound } from "../../core/errors";
import { fromCents, toCents } from "../../core/money";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, cashEntry, cashEntryLine, project } from "../../db/schema";
import { loadSnapshot } from "../../snapshot";
import { assertSeasonOpen, getCurrentSeason } from "../seasons/seasons.service";
import { assertCanManageCash } from "./cash.service";

// The payments of the register tied to the lines of the budget (docs/registro-di-cassa.md, section 5bis):
// a payment can cover several lines, and a line can be paid in instalments.

export interface PayableLine {
  lineId: number;
  item: string;
  project: string;
  /** What the team fund pays of the line (VAT excluded), ACTUAL. */
  teamFundCents: number;
  /** What every payment has paid of it, this one included. */
  paidCents: number;
}

/** The ACTUAL lines of the season that the team fund pays (the only ones a payment can be tied to), with how much is paid. */
export async function listPayableLines(): Promise<PayableLine[]> {
  await assertCanManageCash();
  return payableLines(await getCurrentSeason());
}

async function payableLines(season: { id: number; startsOn: string; endsOn: string }): Promise<PayableLine[]> {
  const paid = await db
    .select({ lineId: cashEntryLine.lineId, amount: sql<string>`sum(${cashEntryLine.amount})` })
    .from(cashEntryLine)
    .groupBy(cashEntryLine.lineId);
  const paidOf = new Map(paid.map((p) => [p.lineId, toCents(p.amount)]));
  return computeLines(await loadSnapshot(season))
    .filter((l) => l.actual.teamFundCents > 0)
    .map((l) => ({
      lineId: l.id,
      item: l.item,
      project: l.projectName,
      teamFundCents: l.actual.teamFundCents,
      paidCents: paidOf.get(l.id) ?? 0,
    }));
}

/**
 * Sets which lines of the budget a payment paid and how much of each: the links of the season chosen
 * in the menu are replaced, those of other seasons stay. The lines are the ACTUAL ones paid by the
 * team fund; the payments of a line never exceed that, and a payment never covers more than it is.
 */
export async function setEntryLines(entryId: number, lines: { lineId: number; amount: string }[]) {
  const actor = await assertCanManageCash();
  const season = await getCurrentSeason();
  const payable = new Map((await payableLines(season)).map((l) => [l.lineId, l]));
  return runWrite(actor, async (tx) => {
    await assertSeasonOpen(tx, season.id);
    const [entry] = await tx.select().from(cashEntry).where(eq(cashEntry.id, entryId)).for("update");
    if (!entry) throw notFound("Movement");
    const outCents = -toCents(entry.amount);
    if (outCents <= 0) throw invalid("Only a payment (money out) can be tied to budget lines");

    const wanted = new Map<number, number>();
    for (const l of lines) {
      if (wanted.has(l.lineId)) throw invalid("A line can be listed only once");
      wanted.set(l.lineId, toCents(l.amount));
    }
    for (const [lineId, cents] of wanted) {
      if (cents <= 0) throw invalid("Every amount must be above zero");
      if (!payable.has(lineId)) throw invalid("A payment can only be tied to a line that the team fund pays (ACTUAL)");
      const line = payable.get(lineId)!;
      // what the other payments paid of it, so that this one does not take it above what the team fund pays
      const [others] = await tx
        .select({ amount: sql<string | null>`sum(${cashEntryLine.amount})` })
        .from(cashEntryLine)
        .where(and(eq(cashEntryLine.lineId, lineId), sql`${cashEntryLine.entryId} <> ${entryId}`));
      if ((others?.amount == null ? 0 : toCents(others.amount)) + cents > line.teamFundCents) {
        throw invalid(`The payments of "${line.item}" cannot exceed what the team fund pays of it`);
      }
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
