// Response shapes. The ones computed by the engine come straight from @erp/calc (type only:
// no engine code is shipped to the browser); the rest are the plain rows of the write API.
export type {
  Analysis, Arrival, ArrivalStatus, AreaSheet, Bom, BomLine, CalcLine, CashFlowSummary, CostPoint, FundSummaryRow,
  Gantt, ItemOrigin, ItemsView, MonthlyInflow, PendingLine, Phase, PhaseCalc, PriceBasis, PriceMethod, PricePoint,
  Priority, SponsorType, StatsRow, Totals, VatReport,
} from "@erp/calc";
import type { ItemOrigin, PendingLine, Phase, PriceBasis, PriceMethod, PricePoint, Bom, CostPoint, StatsRow } from "@erp/calc";

export interface Area {
  id: number;
  code: string;
  name: string;
  position: number;
}

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
}

export interface Bank {
  amount: string;
  asOfDate: string | null;
}

export interface Settings {
  varianceThreshold: number;
}

// --- login, roles, history -----------------------------------------------------------------------

export type Role = "admin" | "pm" | "viewer";

/** What the interface may show; the server enforces the same rules on every request. */
export interface Permissions {
  canEditShared: boolean;
  canManageSuppliers: boolean;
  canManageInventory: boolean;
  canViewHistory: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
}

/** GET /api/me */
export interface Me {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** The areas a `pm` may change. */
  areaIds: number[];
  permissions: Permissions;
}

/** GET /api/auth/config: which ways of signing in this server offers. */
export interface SignInOptions {
  google: boolean;
  devLogin: boolean;
  /** Signed in by the organisation's login proxy: no sign-in page and no Sign out here. */
  proxy: boolean;
  domain: string | null;
}

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  areaIds: number[];
}

export interface HistoryEntry {
  id: number;
  at: string;
  actor: { id: number; email: string; name: string } | null;
  table: string;
  rowId: number;
  action: "insert" | "update" | "delete";
  label: string;
  changes: { field: string; before: unknown; after: unknown }[];
}

export interface HistoryPage {
  entries: HistoryEntry[];
  next: number | null;
}

// --- inventory -----------------------------------------------------------------------------------

export interface Location {
  code: string;
  site: string;
  room: string;
  label: string;
}

export type ItemField = "purpose" | "safetyCodes" | "disposal" | "storageNotes" | "maintenanceNotes";

export interface CategoryFields {
  fallback: ItemField[];
  byCategory: Record<string, ItemField[]>;
}

/** What is typed about an item (everything but the stock). */
export interface ItemDraft {
  name: string;
  code: string;
  category: string;
  unit: string;
  purpose: string;
  safetyCodes: string;
  disposal: string;
  storageNotes: string;
  maintenanceNotes: string;
  flammable: boolean;
  toxic: boolean;
  carcinogenic: boolean;
}

export interface InventoryItem {
  id: number;
  code: string | null;
  name: string;
  purpose: string | null;
  category: string | null;
  unit: string;
  origin: ItemOrigin;
  safetyCodes: string | null;
  disposal: string | null;
  storageNotes: string | null;
  maintenanceNotes: string | null;
  flammable: boolean;
  toxic: boolean;
  carcinogenic: boolean;
  imageUpdatedAt: string | null;
}

export interface ItemRow {
  id: number;
  code: string | null;
  name: string;
  category: string | null;
  unit: string;
  origin: ItemOrigin;
  hasImage: boolean;
  onHandMilli: number;
  boughtMilli: number;
  unitE4: number | null;
  complete: boolean;
  valueCents: number | null;
  places: string[];
  flammable: boolean;
  toxic: boolean;
  carcinogenic: boolean;
}

export interface StockPlace {
  itemId: number;
  location: string;
  spot: string;
  quantityMilli: number;
  label: string;
}

export interface MovementRow {
  id: number;
  kind: "receipt" | "use" | "transfer" | "adjustment" | "disposal" | "build";
  on: string;
  quantity: string;
  location: string;
  spot: string;
  toLocation: string | null;
  toSpot: string | null;
  unitNet: string | null;
  unitGross: string | null;
  unitTeam: string | null;
  projectName: string | null;
  budgetLineId: number | null;
  /** The build that took these parts: they are undone together with it. */
  builtBy: number | null;
  note: string | null;
}

/** A data sheet as the page lists it: the file itself is fetched only when somebody opens it. */
export interface DatasheetRow {
  id: number;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface ItemDetail {
  item: InventoryItem;
  datasheets: DatasheetRow[];
  hasImage: boolean;
  stock: StockPlace[];
  onHandMilli: number;
  boughtMilli: number;
  unitE4: number | null;
  complete: boolean;
  history: PricePoint[];
  movements: MovementRow[];
  bom: Bom | null;
  usedIn: { id: number; name: string }[];
}

export interface PendingRow extends PendingLine {
  receivedItemId: number | null;
  suggestedItemId: number | null;
}

export interface ComponentRow {
  id: number;
  name: string;
  unit: string;
  partsCount: number;
  unitE4: number | null;
  complete: boolean;
  onHandMilli: number;
}

export interface ComponentDetail {
  item: InventoryItem;
  bom: Bom;
  series: CostPoint[];
  notes: Record<number, string>;
}

export interface StatsResult {
  by: "project" | "area" | "category" | "location";
  basis: PriceBasis;
  rows: StatsRow[];
}

export interface ProjectRef {
  id: number;
  name: string;
  areaCode: string;
  areaName: string;
}

/** Which price, read how, on which day: what the price selector holds. */
export interface PriceChoice {
  basis: PriceBasis;
  method: PriceMethod;
  on?: string;
}

/** What the Settings page shows (admin only): the lists with how much each entry is used, and the switches. */
export interface SettingsView {
  categories: { id: number; name: string; fields: ItemField[]; usedBy: number }[];
  uncategorizedFields: ItemField[];
  vatRates: { id: number; rate: number; usedBy: number }[];
  units: { id: number; name: string; usedBy: number }[];
  locations: { id: number; code: string; site: string; room: string; usedBy: number }[];
  calculation: Calculation;
}

export type BankCompare = "day" | "month";

export interface Calculation {
  varianceThreshold: number;
  vatBaseWhenTotalSponsor: "net" | "net-minus-sponsor";
  inflowVatRate: number;
  bankCompare: { summary: BankCompare; timeline: BankCompare };
}

