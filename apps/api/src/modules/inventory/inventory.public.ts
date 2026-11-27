// What other owners may use of the inventory (docs/moduli-architettura.md, §5): nothing else of this folder is imported from outside it, so the
// inventory can change inside without touching them. It grows with what the bridge to the budget needs.

/** What the inventory asks of the others (defined in `inventory.ports.ts`, which the inventory's own services use too). */
export { buildNeedsProject, keepMakeProject, keepMovementProject, knownProjects, lineCarsOfReceipts, makeProjects, movementTies, statsBudget } from "./inventory.ports";
export type { MovementTie, StatsBudget } from "./inventory.ports";

/** Refuses the person who does not keep the inventory: the bridge's pages and writes are the inventory's too. */
export { assertCanManageInventory } from "./access";

/** Goods that arrive for a purchase somebody else prices: what is asked, the check made before anything is written, and the arrival itself. */
export { receiptOfPurchaseInput } from "./inventory.schema";
export type { ReceiptOfPurchaseInput } from "./inventory.schema";
export { checkReceipt, receiveIn } from "./movements.service";

/** Movements and items as plain facts. */
export { itemIdentities, movementsByIds } from "./inventory.data";
export type { MovementFact } from "./inventory.data";
