// What the other parts of the site may use of the budget (docs/moduli-architettura.md, §7.3): its slots, the types they take, and the
// pieces it lends. Nothing else of the folder is for the others; the list of names is checked by architecture.test.ts.
export { inflowActions } from "./slots";
export type { Inflow } from "./types";
export { ArrivalPill } from "./ArrivalPill";
