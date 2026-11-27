// What other owners may use of the budget (docs/moduli-architettura.md, §5): nothing else of these folders is imported from outside them, so the budget
// can change inside without touching them. It grows with the steps of the plan (the rest of the budget in G6).

/** What the budget asks of the others, and tells them (defined in `budget.ports.ts`, which the budget's own services use too). */
export { inflowDeleting, inflowReceipts, linePayments, lineReceipts, outsideBudgetOf, registerBank, registerSponsorship } from "./budget.ports";
export type { InflowReceipt, RegisterIncome } from "./budget.ports";

// --- what the budget gives --------------------------------------------------------------------------

/** The lines of a season as the calculation sees them, with what each costs the team and how much is paid (TO PAY and the payments of the register). */
export { computedLines } from "./budget.service";
/** A season as the calculation sees it: its lines, its projects and the areas. */
export { computedSeason } from "./budget.service";
/** The projects with these ids, with their names; the car of each line; and the lock two arrivals of one purchase take turns on. */
export { lineCars, lockLine, projectsByIds, projectsOfSeason } from "./budget.service";
/** The budget category the lines of the derived area (ADMINISTRATION) are in. */
export { getDerivedAreaCategory } from "./lookups.service";
/** The season each of these lines is in, by line. */
export { seasonsOfLines } from "./budget.service";
/** The name (the item) of each of these lines, by line. */
export { lineLabels } from "./budget.service";

/** The inflows of CASH FLOW as plain facts, and how to delete them inside a transaction already open. */
export { deleteInflowsIn, inflowsByIds, inflowsOfSeason } from "./cashflow.service";
export type { InflowFact } from "./cashflow.service";
/** The BANK of a season and whether the register or a person says so (the day is today, or the last day of a season that is over). */
export { bankOf } from "./cashflow.service";
/** Refuses the person who may not add or delete inflows. */
export { assertCanChangeInflows } from "./cashflow.service";
