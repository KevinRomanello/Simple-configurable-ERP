import type { FundMode, FundType, Phase, Priority, Settings, SponsorType, VatRules } from "./types";

// The Snapshot is everything the engine needs, as plain JSON. The API builds it from the
// database (loadSnapshot); tests build it by hand; nothing in here knows about either.
//
// Units: money in integer cents, quantity in thousandths, unit cost in ten-thousandths of a
// euro, VAT rate in percent. Dates are ISO strings (YYYY-MM-DD).

export interface Figures {
  quantityMilli: number;
  unitCostE4: number;
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
  /** A phase without data is null, which counts as all zeros. */
  figures: Record<Phase, Figures | null>;
}

export interface FundInput {
  id: number;
  name: string;
  kind: "team" | "external";
  /** Whether the fund also covers the VAT of the purchases paid from it (otherwise the team pays it). */
  paysVat: boolean;
  mode: FundMode;
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
}
