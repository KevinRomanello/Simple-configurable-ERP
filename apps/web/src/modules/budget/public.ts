// What the other parts of the site may use of the budget (docs/moduli-architettura.md, §7.3): the slots of its pages, what they take,
// and the pieces it lends.
import { defineSlot, type RowActionFill } from "../../core/slots";
import type { Inflow } from "./types";

export type { Inflow } from "./types";
export { ArrivalPill } from "./ArrivalPill";

/**
 * The actions on an inflow of CASH FLOW that need the register: marking it received or not, and deleting it together with what the
 * register has of the same company (the bridge to the treasury). Without them the page lists the inflows and adds new ones.
 */
export const inflowActions = defineSlot<RowActionFill<Inflow>>("budget.cashflow.inflowActions");
