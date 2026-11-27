import type { AreaInput, OutsideBudget } from "@erp/calc";
import { defineEvent, definePort } from "../../core/contracts";
import type { User } from "../../platform/auth/auth.service";

// What the budget asks of the others (docs/moduli-architettura.md, §5), defined here and not in `budget.public.ts` so that the budget's own services can use
// them without a cycle. The budget works alone:
// every port has a plain answer for when nobody fills it (no register: the BANK is written by hand, nothing is paid, nothing is outside
// the budget). The bridge to the treasury fills them when both are on.

// --- what the budget asks (the answers come from the bridge to the treasury) ----------------------

/** What the register holds in Cassa and Banca at the end of `day`; nothing when there is no register to say it, and then the BANK is the one written by hand. */
export const registerBank = definePort<{ day: string }, { amountCents: number } | null>("registerBank", "budget", () => null);

/** The movement of the register that received an expected inflow. */
export interface InflowReceipt {
  inflowId: number;
  entryId: number;
  on: string;
  cents: number;
  sponsorship: boolean;
}

/** Which of these expected inflows have arrived, and with what movement: none, when there is no register. */
export const inflowReceipts = definePort<{ inflowIds: number[] }, InflowReceipt[]>("inflowReceipts", "budget", () => []);

/** Money that came in to the register ticked as sponsorship: it is the ACTUAL side of CASH FLOW once the BANK is the register's. */
export interface RegisterIncome {
  id: number;
  description: string;
  on: string;
  cents: number;
}

export const registerSponsorship = definePort<{ from: string; to: string }, RegisterIncome[]>("registerSponsorship", "budget", () => []);

/** What the payments of the register have paid of each of these ACTUAL lines, in cents: nothing is paid when there is no register. */
export const linePayments = definePort<{ lineIds: number[] }, { lineId: number; cents: number }[]>("linePayments", "budget", () => []);

/** What the register says is outside the budget, as the projects, lines and money in of the derived area; none when there is no register. */
export const outsideBudgetOf = definePort<{ season: { startsOn: string; endsOn: string }; area: AreaInput }, OutsideBudget | null>("outsideBudgetOf", "budget", () => null);

/** An inflow is about to be deleted from CASH FLOW: whoever tied it to something may refuse, by throwing (the treasury keeps the received ones). */
export const inflowDeleting = defineEvent<{ inflowId: number; actor: User }>("inflowDeleting", "feature");
