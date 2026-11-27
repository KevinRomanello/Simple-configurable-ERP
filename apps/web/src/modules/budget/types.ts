// The shapes of the answers of budget (split from api/types.ts in G7: docs/moduli-architettura.md, §7.1).
import type { MoneyIn, Phase, Totals } from "@erp/calc";

/** GET /api/views/totals(/year, /car): TOTAL of a season, a calendar year or a car, and what came in (none for a car). */
export type TotalsView = Totals & {
  moneyIn: MoneyIn | null;
  /** A year only: the GRAND TOTAL of the phases without a purchase date, which are in no year. */
  undated?: Record<Phase, number>;
};
export type FundType = "fund" | "gift" | "gift_vat";
/** A fund as the API serves it: the team fund, or a sponsor with the rules that decide VAT and coverage. */
export interface Fund {
  id: number;
  name: string;
  kind: "team" | "external";
  type: FundType;
  /** The sponsor's VAT rate in percent; null for the team fund. */
  vatRate: number | null;
  group: string | null;
  /** A fund with no ceiling: no sum of money behind it, ACTUAL only (the CASH FROM page says how much was spent). */
  unlimited: boolean;
  /** What the sponsor brings in each phase: one value and the day it arrives (null: nothing). */
  contracts: Record<Phase, Money | null>;
}
export interface Money {
  amount: string;
  inflowDate: string | null;
}
/** What the sponsor form sends. */
export interface SponsorBody {
  name: string;
  type: FundType;
  vatRate: number | null;
  group: string | null;
  unlimited: boolean;
}
/** The money a new sponsor brings: a contract per phase it counts in. */
export interface NewContract {
  phase: Phase;
  amount: string;
  inflowDate: string | null;
}
export interface Supplier {
  id: number;
  name: string;
}
export interface Inflow {
  id: number;
  phase: "estimate" | "actual";
  sourceName: string;
  amount: string;
  inflowDate: string | null;
  /** Sponsorship money owes 11% VAT; any other money (a membership fee) does not. */
  sponsorship: boolean;
  /** "register": an actual inflow that is a sponsorship movement of the register (read only). */
  source: "typed" | "register";
  /** The movement of the register that received this expected inflow. */
  cashEntryId: number | null;
  receivedOn: string | null;
  receivedAmount: string | null;
  /** Expected, past its day and not received: it counts from the day after the BANK. */
  late: boolean;
}
export interface Bank {
  amount: string;
  asOfDate: string | null;
  /** Who says so: the register of the team's money (Cassa + Banca on that day), or a balance written by hand. */
  source: "register" | "typed";
}
export interface Settings {
  varianceThreshold: number;
}
export type BankCompare = "day" | "month";
export interface Calculation {
  varianceThreshold: number;
  vatBaseWhenTotalSponsor: "net" | "net-minus-sponsor";
  inflowVatRate: number;
  bankCompare: { summary: BankCompare; timeline: BankCompare };
}
