// What the other parts of the site may use of the inventory (docs/moduli-architettura.md, §7.3): its slots, the types they take, and
// what it lends. Nothing else of the folder is for the others; the list of names is checked by architecture.test.ts.
import { inventoryApi } from "./api";

export { purposeProjects } from "./slots";
export type { ProjectRef, PurchaseToReceive } from "./types";
/** The form of an arrival: PENDING opens it for a purchase of the budget (`line`, `send`). */
export { ReceiveForm } from "./ReceiveForm";
/** The lists the forms of the inventory need, and the price the person chose to see the goods at. */
export { useInventoryLookups } from "./inventory";
export { usePrice } from "./price";

/** The items of the inventory, at the price chosen. */
export const inventoryItems = inventoryApi.inventoryItems;
