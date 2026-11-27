// The slots of the pages of the treasury (docs/moduli-architettura.md, §7.4): the others fill them through public.ts.
import type { ComponentType } from "react";
import { defineSlot, type RowActionFill } from "../../core/slots";
import type { CashEntryRow } from "./types";

/** More actions on a movement of the register: «Link to budget lines» (the bridge to the budget). */
export const registerRowActions = defineSlot<RowActionFill<CashEntryRow>>("treasury.register.rowActions");

/** More panels in Settings › Register, after the lists of the register: the Voce of a payment by budget category (the bridge to the budget). */
export const registerSettings = defineSlot<ComponentType>("treasury.settings.panels");
