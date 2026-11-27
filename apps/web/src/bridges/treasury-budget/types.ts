// The shapes of the answers of treasury-budget (split from api/types.ts in G7: docs/moduli-architettura.md, §7.1).
import type { ToPayLine } from "@erp/calc";
import type { CashAccount } from "../../modules/treasury/types";

/** One thing that can be deleted from CASH FLOW: an inflow (expected or actual) or a movement of the register (GET /api/treasury-budget/inflows/related). */
export interface RelatedVoice {
  kind: "inflow" | "entry";
  id: number;
  name: string;
  amount: string;
  date: string | null;
  /** An expected inflow that a movement of the register received. */
  received: boolean;
  receivedOn: string | null;
  /** False for an actual inflow typed by hand while the BANK comes from the register: the cash flow does not count it. */
  counted: boolean;
  /** The row that was pressed. */
  pressed: boolean;
  canDelete: boolean;
  /** Why it cannot be deleted, when it cannot. */
  why: string | null;
}
/** Everything of one company in the season; the movements of the register only for whoever can see the register (else how many there are). */
export interface RelatedInflows {
  expected: RelatedVoice[];
  actual: RelatedVoice[];
  register: RelatedVoice[];
  registerHidden: number;
}
/** GET /api/treasury-budget/inflows/receivable: a movement of money in that can receive an expected inflow. */
export interface Receivable {
  id: number;
  on: string;
  description: string;
  account: CashAccount;
  amount: string;
  sponsorship: boolean;
}
/** GET /api/treasury-budget/payable-lines: an ACTUAL line the team pays for (the net out of its fund and the VAT), and how much the register has paid of it. */
export interface PayableLine {
  lineId: number;
  item: string;
  project: string;
  teamFundCents: number;
  teamVatCents: number;
  /** The net and the VAT together: the most a payment can cover. */
  totalCents: number;
  paidCents: number;
}
/** GET /api/treasury-budget/to-pay: a line the team still has to pay, with the season it is of and the Voce its category starts from. */
export interface ToPayRow extends ToPayLine {
  seasonId: number;
  seasonName: string;
  suggestedCategoryId: number | null;
}
export interface ToPay {
  rows: ToPayRow[];
  /** The method of the last payment: the next one starts from it. */
  lastMethodId: number | null;
}
/** GET /api/treasury-budget/to-link: a payment that pays no line of the budget yet. */
export interface ToLinkRow {
  id: number;
  on: string;
  description: string;
  account: CashAccount;
  /** Negative: money out. */
  cents: number;
  categoryId: number | null;
  methodId: number | null;
  lines: [];
}
/** GET /api/treasury-budget/category-voci: the Voce a payment for a line of this budget category starts from. */
export interface CategoryDefault {
  categoryId: number;
  name: string;
  voceId: number | null;
}
