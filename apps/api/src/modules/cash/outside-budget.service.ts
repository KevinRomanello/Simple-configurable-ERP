import { outsideBudget, sectionsOfVoci, type AreaInput, type OutsideBudget, type OutsideEntry } from "@erp/calc";
import { and, asc, eq, gte, lte, notExists, sql } from "drizzle-orm";
import { toCents } from "../../core/money";
import type { Tx } from "../../core/tx";
import { cashCategory, cashEntry, cashEntryLine, teamInflow } from "../../db/schema";
import { getDerivedAreaCategory, getStatementLayout } from "../lookups/lookups.service";

// What the team spends and receives outside the budget, read from the register: the movements the derived area is made of
// (docs/spese-fuori-budget.md). Nothing is stored; the snapshot asks for it at every reading.

type Reader = Pick<Tx, "select">;

/**
 * The movements of a season that count outside the budget: their Voce is `outside`, and they are tied to nothing. A
 * movement tied to a budget line counts through the line, one that received an inflow counts as that inflow, and money in
 * ticked as sponsorship is an ACTUAL inflow, so none of them can count twice.
 */
async function outsideEntries(reader: Reader, season: { startsOn: string; endsOn: string }): Promise<OutsideEntry[]> {
  const rows = await reader
    .select({ on: cashEntry.entryOn, voce: cashCategory.name, amount: cashEntry.amount })
    .from(cashEntry)
    .innerJoin(cashCategory, eq(cashEntry.categoryId, cashCategory.id))
    .where(
      and(
        eq(cashCategory.scope, "outside"),
        gte(cashEntry.entryOn, season.startsOn),
        lte(cashEntry.entryOn, season.endsOn),
        eq(cashEntry.sponsorship, false),
        notExists(reader.select({ one: sql`1` }).from(cashEntryLine).where(eq(cashEntryLine.entryId, cashEntry.id))),
        notExists(reader.select({ one: sql`1` }).from(teamInflow).where(eq(teamInflow.cashEntryId, cashEntry.id))),
      ),
    )
    .orderBy(asc(cashEntry.entryOn), asc(cashEntry.id));
  return rows.map((r) => ({ on: r.on, voce: r.voce, cents: toCents(r.amount) }));
}

/** The projects, lines and money in of the derived area for a season. */
export async function loadOutsideBudget(reader: Reader, season: { startsOn: string; endsOn: string }, area: AreaInput): Promise<OutsideBudget> {
  const entries = await outsideEntries(reader, season);
  return outsideBudget(entries, sectionsOfVoci(await getStatementLayout()), area, await getDerivedAreaCategory());
}
