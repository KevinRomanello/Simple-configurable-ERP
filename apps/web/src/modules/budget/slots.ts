// The slots of the pages of the budget (docs/moduli-architettura.md, §7.4): the others fill them through public.ts.
import { defineSlot, type RowActionFill } from "../../core/slots";
import type { Inflow } from "./types";

/**
 * The actions on an inflow of CASH FLOW that need the register: marking it received or not, and deleting it together with what the
 * register has of the same company (the bridge to the treasury). Without them the page lists the inflows and adds new ones.
 */
export const inflowActions = defineSlot<RowActionFill<Inflow>>("budget.cashflow.inflowActions");

/**
 * Whether the site knows where the goods of the purchases are: the bridge to the inventory says so. Without it (the inventory off) the
 * budget shows no ARRIVED column, no arrival date of ACTUAL and no state of arrival (docs/moduli-architettura.md, §4.4).
 */
export const arrivals = defineSlot<true>("budget.arrivals");
