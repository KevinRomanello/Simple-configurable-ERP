// What the other parts of the site may use of the treasury (docs/moduli-architettura.md, §7.3): the slots of its pages and what they take.
import type { ComponentType } from "react";
import { defineSlot, type RowActionFill } from "../../core/slots";
import type { CashEntryRow } from "./types";

export type { CashAccount, CashEntryRow } from "./types";

/** More actions on a movement of the register: «Link to budget lines» (the bridge to the budget). */
export const registerRowActions = defineSlot<RowActionFill<CashEntryRow>>("treasury.register.rowActions");

/** More panels in Settings › Register, after the lists of the register: the Voce of a payment by budget category (the bridge to the budget). */
export const registerSettings = defineSlot<ComponentType>("treasury.settings.panels");
