// What other owners may use of the register of the team's money (docs/moduli-architettura.md, §5): nothing else of this folder is imported
// from outside it, so the register can change inside without touching them. It grows with what the bridge to the budget needs.

/** Adds a movement inside a transaction that is already open (the register's own form and «Pay» and «Mark as received» all end here). */
export { insertEntry } from "./cash.service";
/** Deletes a movement inside a transaction that is already open; what was tied to it goes with it. */
export { deleteEntryIn } from "./cash.service";
/** What the accounts held at the end of a day, for the BANK of CASH FLOW; null if the register knows nothing up to then. */
export { registerBalanceAt } from "./cash.service";
/** Refuses the person who is not the treasury or an admin: the register is theirs, and so is whatever the bridge does with it. */
export { assertCanManageCash } from "./cash.service";
/** Refuses a Voce or a payment method that does not exist. */
export { assertListed } from "./cash.service";
export type { CreateEntryInput } from "./cash.schema";

/** The rows of the financial statement (the sections of the Voci: the derived area of the budget is made of them). */
export { getStatementLayout } from "./statement.service";

/** Movements of the register as plain facts, for the bridge to tie them to the budget. */
export { entriesByIds, lastPaymentMethodId, moneyInBetween, outsideBetween, paymentsBetween, sponsorshipMoneyBetween } from "./treasury.reads";
export type { DayRange, EntryFact, OutsideFact } from "./treasury.reads";

/** What the register asks the bridge, and tells it (defined in `treasury.links.ts`, which the register's own services use too). */
export { entryChanging, entryLinks } from "./treasury.links";
export type { EntryLink } from "./treasury.links";
