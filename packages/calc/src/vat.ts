import { nextMondayIfWeekend, parseIso, quarterFromIndex, quarterIndex, quarterOf, toIso } from "./dates";
import type { Quarter, VatRules } from "./types";

/** The day the VAT of every purchase made in `quarter` falls due. */
export function deadlineForQuarter(quarter: Quarter, rules: VatRules): string {
  const rule = rules.deadlines.find((r) => r.quarter === quarter.quarter);
  if (!rule) throw new Error(`No VAT deadline rule for quarter ${quarter.quarter}`);
  const due = toIso({
    year: quarter.year + rule.yearOffset,
    month: rule.month,
    day: rule.day,
  });
  return rules.shiftWeekendToMonday ? nextMondayIfWeekend(due) : due;
}

/** The day the VAT of a purchase made on `purchaseDate` falls due. */
export function vatDeadline(purchaseDate: string, rules: VatRules): string {
  parseIso(purchaseDate); // fail loudly on a malformed date
  return deadlineForQuarter(quarterOf(purchaseDate), rules);
}

/**
 * The first day of the quarter after the one `date` falls in (calendar quarters): the day the VAT
 * on an inflow is paid. An inflow on 9 January pays on 1 April; one on 1 April, on 1 July.
 */
export function firstDayOfNextQuarter(date: string): string {
  const next = quarterFromIndex(quarterIndex(quarterOf(date)) + 1);
  return toIso({ year: next.year, month: (next.quarter - 1) * 3 + 1, day: 1 });
}
