import type { Phase, Priority, Settings, SponsorType, VatRules } from "./types";

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
  vatRate: number | null;
  fundId: number | null;
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
  /** Whether the fund also covers the VAT of the purchases paid from it, per phase. */
  paysVat: Record<Phase, boolean>;
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
  bank: BankInput | null;
}
