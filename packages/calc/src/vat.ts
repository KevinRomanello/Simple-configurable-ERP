import { nextMondayIfWeekend, parseIso, quarterOf, toIso } from "./dates";
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
