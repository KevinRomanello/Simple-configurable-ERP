// Response shapes. The ones computed by the engine come straight from @erp/calc (type only:
// no engine code is shipped to the browser); the rest are the plain rows of the write API.
export type {
  Analysis, Arrival, ArrivalStatus, AreaSheet, Bom, BomLine, CalcLine, CashFlowSummary, CostPoint, FundSummaryRow,
  Gantt, ItemOrigin, ItemsView, MonthlyInflow, PendingLine, Phase, PhaseCalc, PriceBasis, PriceMethod, PricePoint,
  Priority, SponsorType, StatsRow, Totals, VatReport,
} from "@erp/calc";
import type { ItemOrigin, PendingLine, PriceBasis, PriceMethod, PricePoint, Bom, CostPoint, StatsRow } from "@erp/calc";

export interface Area {
  id: number;
  code: string;
  name: string;
  position: number;
}

export interface Fund {
  id: number;
  name: string;
  kind: "team" | "external";
  paysVatEstimate: boolean;
  paysVatActual: boolean;
}

export interface Contract {
  id: number;
  fundId: number;
  fundName: string;
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
  kind: "receipt" | "use" | "transfer" | "adjustment" | "disposal";
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
  note: string | null;
}

export interface ItemDetail {
  item: InventoryItem;
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
