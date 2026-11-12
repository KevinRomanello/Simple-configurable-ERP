import type { FundType, Phase, Priority, Settings, SponsorType, VatRules } from "./types";

// The Snapshot is everything the engine needs, as plain JSON. The API builds it from the
// database (loadSnapshot); tests build it by hand; nothing in here knows about either.
//
// Units: money in integer cents, quantity in thousandths, unit cost in ten-thousandths of a
// euro, VAT rate in percent. Dates are ISO strings (YYYY-MM-DD).

export interface Figures {
  quantityMilli: number;
  unitCostE4: number;
  /**
   * The price of one unit typed WITH the VAT in it (an invoice total, a receipt), in ten-thousandths of a
   * euro. When it is there it is the number that never moves and the net is worked out from it (the VAT
   * rate of the line, or of the fund that pays); `unitCostE4` is then 0. Absent or null: the price was
   * typed without VAT. A partial sponsor is not allowed with it (the server refuses that).
   */
  unitGrossE4?: number | null;
  sponsorType: SponsorType | null;
  /** Only meaningful for a partial sponsor; a total sponsor always covers the whole net. */
  sponsorValueCents: number | null;
  /** Used when the line is paid by the team fund; a sponsor's fund brings its own rate. */
  vatRate: number | null;
  /** The funds that pay the line, in order: the next one pays what the previous cannot cover. */
  fundIds: number[];
  supplierId: number | null;
  purchaseDate: string | null;
  arrivalDate: string | null;
}

export interface AreaInput {
  id: number;
  code: string;
  name: string;
  position: number;
  /** Calculated from the register (what is outside the budget): nothing in it can be typed. */
  derived?: boolean;
}

export interface ProjectInput {
  id: number;
  areaId: number;
  name: string;
  ownerName: string | null;
  position: number;
}

export interface LineInput {
  id: number;
  projectId: number;
  position: number;
  item: string;
  category: string | null;
  priority: string | null;
  note: string | null;
  version: number;
  /** Bought for the car of another season (its id); null = the car of the line's own season. */
  carSeasonId: number | null;
  /** A phase without data is null, which counts as all zeros. */
  figures: Record<Phase, Figures | null>;
}

export interface FundInput {
  id: number;
  name: string;
  kind: "team" | "external";
  type: FundType;
  /** The sponsor's VAT rate in percent; null for the team fund, whose rate is chosen per line. */
  vatRate: number | null;
  /** Funds of the same group can pay one line together; null = alone. */
  group: string | null;
}

export interface ContractInput {
  id: number;
  fundId: number;
  phase: Phase;
  amountCents: number;
  inflowDate: string | null;
}

export interface InflowInput {
  id: number;
  phase: Phase;
  sourceName: string;
  amountCents: number;
  inflowDate: string | null;
  /** Sponsorship money owes the VAT on inflows; any other money (a membership fee) does not. */
  sponsorship: boolean;
}

export interface SupplierInput {
  id: number;
  name: string;
}

/** How much of a budget line has physically arrived: the sum of its receipts in the inventory. */
export interface ReceiptInput {
  lineId: number;
  quantityMilli: number;
}

/** Money that came in outside the budget (a membership fee), in one month and on one Voce of the register. */
export interface RegisterIncome {
  voce: string;
  /** The day of the last movement of the month. */
  on: string;
  cents: number;
}

export interface BankInput {
  amountCents: number;
  asOfDate: string | null;
}

export interface Lookups {
  categories: string[];
  priorities: readonly Priority[];
  vatRates: number[];
  vatRules: VatRules;
  settings: Settings;
}

/** The payments of the register linked to a budget line, summed: how much of what the team pays for it (net, then VAT) is paid (ACTUAL). */
export interface LinePayment {
  lineId: number;
  cents: number;
}

export interface Snapshot {
  lookups: Lookups;
  /** Ordered by position. */
  areas: AreaInput[];
  projects: ProjectInput[];
  lines: LineInput[];
  funds: FundInput[];
  contracts: ContractInput[];
  inflows: InflowInput[];
  suppliers: SupplierInput[];
  /** One entry per budget line that has arrived, at least in part (see docs/inventario.md). */
  receipts: ReceiptInput[];
  bank: BankInput | null;
  /**
   * Payments of the register linked to ACTUAL lines, summed by line: what the page TO PAY and the budget say
   * is paid. They change the forecast only when `lateFrom` is there too, which is when the BANK comes from the
   * register (otherwise the payments are not in it): then a line counts only what is still to pay.
   */
  payments?: LinePayment[];
  /** What came in outside the budget, from the register: money in on the Voci that are outside it and tied to nothing. Only MONEY IN reads it. */
  registerIncome?: RegisterIncome[];
  /** Set only when the BANK comes from the register: the day after the BANK day, when a late line leaves the team fund. */
  lateFrom?: string;
}
