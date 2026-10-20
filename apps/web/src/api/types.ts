// Response shapes. The ones computed by the engine come straight from @erp/calc (type only:
// no engine code is shipped to the browser); the rest are the plain rows of the write API.
export type {
  Analysis, AreaSheet, CalcLine, CashFlowSummary, FundSummaryRow, Gantt, ItemsView, MonthlyInflow,
  Phase, PhaseCalc, Priority, SponsorType, Totals, VatReport,
} from "@erp/calc";

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
