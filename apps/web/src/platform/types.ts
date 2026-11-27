// The shapes of the answers of platform (split from api/types.ts in G7: docs/moduli-architettura.md, §7.1).

/** GET /api/seasons: one budget, the car the team builds in it, and whether it can still be changed. */
export interface Season {
  id: number;
  name: string;
  startsOn: string;
  endsOn: string;
  car: string;
  readOnly: boolean;
  /** The season of today: shown when nothing else is chosen. */
  current: boolean;
  /** How many budget lines it has. */
  lines: number;
}
export interface Area {
  id: number;
  code: string;
  name: string;
  position: number;
  /** Calculated from the register of the team's money (what is outside the budget): read-only, nobody is assigned to it. */
  derived: boolean;
}
// --- login, roles, history -----------------------------------------------------------------------

/** `pm` is shown as "User" (the person who changes their areas); the two boxes of the users page open more. */
export type Role = "admin" | "pm" | "viewer";
/** What the interface may show; the server enforces the same rules on every request. */
export interface Permissions {
  /** The funds of the sponsors and their contracts (CASH FROM): admins, and project managers with the sponsors box. */
  canEditShared: boolean;
  /** The money of the team: the register, and the BANK and the inflows of CASH FLOW (admins, and project managers with the treasury box). */
  canManageCash: boolean;
  /** Adding and deleting inflows (CASH FLOW): the treasury and the sponsors; receiving them and the BANK are `canManageCash` only. */
  canChangeInflows: boolean;
  canManageSuppliers: boolean;
  canManageInventory: boolean;
  /** TO PAY (the bridge between the register and the budget): who keeps the budget, admins and users. Paying stays `canManageCash`. */
  canSeeToPay: boolean;
  /** Grouping the lines of TO PAY bought in one order: a user the lines of their areas, the treasury and the admins any line. */
  canGroupOrders: boolean;
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
  /** The switch of the admins: whether the site can be changed from a phone. */
  editOnPhone: boolean;
  /** Which modules are on (Settings › App › Modules): a module that is off is not shown anywhere. */
  modules: Record<string, boolean>;
  /** Which bridges are on: a bridge is on while all the modules it joins are (docs/moduli-architettura.md, §8). */
  bridges: Record<string, boolean>;
  /** Set by the interface, not the server: this screen shows the site read-only (`lockEditing`). */
  readOnly?: boolean;
}
/** The key of a service (GET /api/tokens): who it acts as, who made it and whether it was revoked. The key itself is shown only when it is made. */
export interface ApiTokenRow {
  id: number;
  name: string;
  userId: number;
  userEmail: string;
  userName: string;
  createdAt: string;
  createdBy: string | null;
  revokedAt: string | null;
}
/** A part of the ERP that an admin can turn off (GET /api/modules). */
export interface AppModule {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** What goes off with it: the bridges that need it, as each says what it shows («TO PAY, …»). */
  alsoOff: string[];
}
/** GET /api/auth/config: which ways of signing in this server offers. */
export interface SignInOptions {
  google: boolean;
  devLogin: boolean;
  /** Signed in by the organisation's login proxy: no sign-in page and no Sign out here. */
  proxy: boolean;
  domain: string | null;
}
/** A box of a person that a module offers (Treasury, Sponsors), and the roles that may have it. */
export interface UserFlag {
  key: string;
  label: string;
  explanation: string;
  roles: Role[];
}
export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** The boxes ticked for the person (the modules say which there are: `UserFlag`). */
  flags: string[];
  active: boolean;
  /** Role, areas, boxes and "active" come from the registry (docs/anagrafiche.md, §9): read-only here. */
  managed: boolean;
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
/** What the Settings page shows (admin only): the lists with how much each entry is used, and the switches. */
/** GET /api/settings: the core's part of the Settings page (the switches of the calculation are the budget's: `Calculation`). */
export interface SettingsView {
  categories: { id: number; name: string; usedBy: number }[];
  vatRates: { id: number; rate: number; usedBy: number }[];
}
