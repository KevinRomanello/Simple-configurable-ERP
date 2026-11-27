// What the other parts of the site may use of the treasury (docs/moduli-architettura.md, §7.3): its slots, the types they take, and
// what it lends. Nothing else of the folder is for the others; the list of names is checked by architecture.test.ts.
import { treasuryApi } from "./api";

export { registerRowActions, registerSettings } from "./slots";
export type { CashAccount, CashEntryRow } from "./types";

/** The lists of the register that a payment or a receipt chooses from: the Voci and the payment methods. */
export const registerLists = { voci: treasuryApi.cashCategories, methods: treasuryApi.cashMethods };
