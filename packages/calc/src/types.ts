// Shared vocabulary of the calculation engine. These are the fixed enums of the domain
// (they never become configurable) plus the shapes of the values that the API serves
// from its hardcoded-for-now lookup functions.

/** The two columns blocks of the old sheet: EXPECTED/ESTIMATED and ACTUAL. */
export const PHASES = ["estimate", "actual"] as const;
export type Phase = (typeof PHASES)[number];

export const PRIORITIES = ["High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** How much of a line's net cost a sponsor covers. */
export const SPONSOR_TYPES = ["none", "partial", "total"] as const;
export type SponsorType = (typeof SPONSOR_TYPES)[number];

/**
 * What a sponsor gives, in the words of the treasurer:
 *  - `fund`:     a sum to pay purchases from; the VAT of those purchases is added at the sponsor's rate;
 *  - `gift`:     goods for free and no VAT at all;
 *  - `gift_vat`: goods for free, but the team pays the VAT of the counter-invoice (advertising).
 */
export const FUND_TYPES = ["fund", "gift", "gift_vat"] as const;
export type FundType = (typeof FUND_TYPES)[number];

export type QuarterNumber = 1 | 2 | 3 | 4;

export interface Quarter {
  year: number;
  quarter: QuarterNumber;
}

/** Where the VAT of a purchase made in `quarter` falls due. */
export interface VatDeadlineRule {
  quarter: QuarterNumber;
  /** Calendar month, 1-12. */
  month: number;
  day: number;
  /** 0 = same year as the purchase, 1 = the following year. */
  yearOffset: 0 | 1;
}

export interface VatRules {
  deadlines: VatDeadlineRule[];
  /** A deadline falling on Saturday or Sunday moves to the following Monday. */
  shiftWeekendToMonday: boolean;
}

/** `day` compares full dates, `month` compares only the calendar month. */
export type BankCompareMode = "day" | "month";

export interface Settings {
  /** TOTAL view: variances beyond +/- this ratio are flagged. */
  varianceThreshold: number;
  /** Open question Q1: which amount the VAT is computed on when the sponsor covers everything. */
  vatBaseWhenTotalSponsor: "net" | "net-minus-sponsor";
  /** VAT, in percent, that the team owes on every inflow: it is sponsorship, invoiced (by law). */
  inflowVatRate: number;
  /** Open question Q2: how outflows/inflows are compared with the BANK date. */
  bankCompare: { summary: BankCompareMode; timeline: BankCompareMode };
  /** Default span of the per-area VAT report; it widens automatically around purchase dates. */
  vatReportHorizon: { from: Quarter; to: Quarter };
}
