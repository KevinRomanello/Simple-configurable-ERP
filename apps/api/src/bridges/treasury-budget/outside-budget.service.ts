import { outsideBudget, sectionsOfVoci, type AreaInput, type OutsideBudget, type OutsideEntry } from "@erp/calc";
import type { Db } from "../../core/contracts";
import { cashEntryLine, inflowReceipt } from "../../db/schema/treasury-budget";
import { getDerivedAreaCategory, getStatementLayout } from "../../platform/lookups/lookups.service";
import { outsideBetween } from "../../modules/treasury/treasury.public";

// What the team spends and receives outside the budget, read from the register: the movements the derived area is made of
// (docs/spese-fuori-budget.md). Nothing is stored; the snapshot asks for it at every reading, through the port `outsideBudgetOf`.

/**
 * The movements of a season that count outside the budget: their Voce is `outside`, and they are tied to nothing. A
 * movement tied to a budget line counts through the line, one that received an inflow counts as that inflow, and money in
 * ticked as sponsorship is an ACTUAL inflow, so none of them can count twice.
 */
async function outsideEntries(reader: Db, season: { startsOn: string; endsOn: string }): Promise<OutsideEntry[]> {
  const outside = await outsideBetween(reader, { from: season.startsOn, to: season.endsOn });
  // the two tables of the bridge are small (a row for each tie), so they are read whole rather than asked about each movement
  const [paying, received] = await Promise.all([reader.select({ id: cashEntryLine.entryId }).from(cashEntryLine), reader.select({ id: inflowReceipt.entryId }).from(inflowReceipt)]);
  const tied = new Set([...paying, ...received].map((r) => r.id));
  return outside.filter((e) => !tied.has(e.id)).map((e) => ({ on: e.on, voce: e.voce, cents: e.cents }));
}

/** The projects, lines and money in of the derived area for a season. */
export async function loadOutsideBudget(reader: Db, season: { startsOn: string; endsOn: string }, area: AreaInput): Promise<OutsideBudget> {
  const entries = await outsideEntries(reader, season);
  return outsideBudget(entries, sectionsOfVoci(await getStatementLayout()), area, await getDerivedAreaCategory());
}
