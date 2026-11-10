// Response shapes. The ones computed by the engine come straight from @erp/calc (type only:
// no engine code is shipped to the browser); the rest are the plain rows of the write API.
export type {
  Analysis, Arrival, ArrivalStatus, AreaSheet, Bom, BomLine, CalcLine, CashFlowSummary, CostPoint, FundSummaryRow,
  Gantt, ItemOrigin, ItemsView, MoneyIn, MonthlyInflow, PendingLine, Phase, PhaseCalc, PriceBasis, PriceMethod, PricePoint,
  Priority, SponsorType, StatsRow, Totals, TotalsBlock, TotalsFigures, VatReport,
} from "@erp/calc";
import type { ItemOrigin, MoneyIn, PendingLine, Phase, PriceBasis, PriceMethod, PricePoint, Bom, CostPoint, StatsRow, Totals } from "@erp/calc";

/** GET /api/views/totals(/year, /car): TOTAL of a season, a calendar year or a car, and what came in (none for a car). */
export type TotalsView = Totals & {
  moneyIn: MoneyIn | null;
  /** A year only: the GRAND TOTAL of the phases without a purchase date, which are in no year. */
  undated?: Record<Phase, number>;
};

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

/** GET /api/inflows/receivable: a movement of money in that can receive an expected inflow. */
export interface Receivable {
  id: number;
  on: string;
  description: string;
  account: CashAccount;
  amount: string;
  sponsorship: boolean;
}

/** GET /api/cash/payable-lines: an ACTUAL line the team fund pays, and how much the register has paid of it. */
export interface PayableLine {
  lineId: number;
  item: string;
  project: string;
  teamFundCents: number;
  paidCents: number;
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

// --- login, roles, history -----------------------------------------------------------------------

/** `pm` is shown as "User" (the person who changes their areas); the two boxes of the users page open more. */
export type Role = "admin" | "pm" | "viewer";

/** What the interface may show; the server enforces the same rules on every request. */
export interface Permissions {
  /** The funds of the sponsors and their contracts (CASH FROM): admins, and project managers with the sponsors box. */
  canEditShared: boolean;
  /** The money of the team: the register, and the BANK and the inflows of CASH FLOW (admins, and project managers with the treasury box). */
  canManageCash: boolean;
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
  /** A project manager who also keeps the money of the team. */
  treasury: boolean;
  /** A project manager who also keeps the sponsors. */
  sponsors: boolean;
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

/** What is written in a parameter of an item type: a number (with its unit), one of a list, a text, a yes or no. */
export type ParamKind = "number" | "list" | "text" | "yesno";

export interface TypeParam {
  id: number;
  typeId: number;
  name: string;
  kind: ParamKind;
  /** A number: its unit (Ω, V, mm²). */
  unit: string | null;
  /** A number: written with k, M, m, µ… */
  prefixes: boolean;
  /** A list: what can be chosen. */
  choices: string[];
  position: number;
  /** How many items have something written in it. */
  filledIn: number;
}

/** A kind of thing the team keeps (Resistor, Screw…), with what is written about each one. */
export interface ItemType {
  id: number;
  name: string;
  /** null: every area. */
  areaId: number | null;
  /** Whether its items are asked flammable, toxic, carcinogenic. */
  hazards: boolean;
  items: number;
  params: TypeParam[];
}

/** What is written about an item, by parameter: a number as an exact decimal in its unit ("4700"), a text, yes or no. */
export type ParamValues = Record<number, string | boolean>;

/** What is typed about an item (everything but the stock). */
export interface ItemDraft {
  name: string;
  code: string;
  category: string;
  /** "" for none, else the id. */
  areaId: string;
  typeId: string;
  /** The parameters of the type as typed ("4.7k"); yes or no as a box. */
  values: Record<number, string | boolean>;
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
  areaId: number | null;
  typeId: number | null;
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
  areaId: number | null;
  typeId: number | null;
  values: ParamValues;
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
  values: ParamValues;
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
  by: "project" | "area" | "category" | "location" | "car";
  basis: PriceBasis;
  /** The season shown: what was bought and used in its days. */
  season: { name: string; from: string; to: string };
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


// --- the register of the team's money (docs/registro-di-cassa.md) -----------------------------------

export type CashAccount = "cash" | "bank" | "paypal";
export type CashBalances = Record<CashAccount, number>;

/** A Voce or a payment method, as Settings and the register form list them. */
export interface CashListItem {
  id: number;
  name: string;
  usedBy: number;
  /** Voci only: money in on it is sponsorship unless the movement says otherwise. */
  sponsorship?: boolean;
}

export interface CashEntryRow {
  id: number;
  on: string;
  description: string;
  categoryId: number | null;
  methodId: number | null;
  account: CashAccount;
  /** Positive for money in, negative for money out. */
  cents: number;
  invoiceChecked: boolean;
  sponsorship: boolean;
  /** Every account after this movement, and the total of cassa and banca. */
  balances: CashBalances;
  total: number;
  /** The expected inflow this movement received. */
  inflow: { id: number; sourceName: string } | null;
  /** The lines of the budget this payment paid, and how much of each. */
  lines: { lineId: number; item: string; cents: number }[];
}

/** GET /api/cash/register */
export interface CashRegister {
  year: number;
  years: number[];
  opening: CashBalances;
  /** The accounts whose opening was typed for this year; the others carry over from the year before. */
  openingSet: Record<CashAccount, boolean>;
  closing: CashBalances;
  total: { opening: number; closing: number };
  entries: CashEntryRow[];
}

/** What the form of a movement sends: the amount typed positive, the direction apart. */
export interface CashEntryBody {
  on: string;
  description: string;
  categoryId: number | null;
  methodId: number | null;
  account: CashAccount;
  direction: "in" | "out";
  amount: string;
  invoiceChecked: boolean;
  sponsorship: boolean;
}

/** POST /api/cash/import/preview: what the sheet holds against what the register holds, nothing saved. */
export interface ImportPreview {
  year: number;
  years: { year: number; rows: number }[];
  rows: { total: number; used: number; outsideYear: number };
  outside: { row: number; on: string; description: string; account: CashAccount; cents: number }[];
  /** What the rows of other years add to each account: left out, the balances part from the sheet's by this. */
  outsideEffect: CashBalances;
  same: number;
  changed: { row: number; entryId: number; fields: string[]; description: string; siteDescription: string }[];
  changedCount: number;
  added: { row: number; on: string; description: string; account: CashAccount; cents: number }[];
  addedCount: number;
  onlySite: number;
  noCategory: number;
  unknownCategories: { name: string; rows: number }[];
  unknownMethods: { name: string; rows: number }[];
  sponsorshipAdded: number;
  balances: { sheet: CashBalances; site: CashBalances };
  hasOpening: boolean;
}

/** POST /api/cash/import */
export interface ImportResult {
  mode: "add" | "replace";
  year: number;
  added: number;
  deleted: number;
  updated: number;
  openings: number;
}

/** What is sent to check or apply a sheet: the rows already read, and how to treat them. */
export interface ImportBody {
  sheetName: string;
  opening: { label: string | null; cents: CashBalances } | null;
  rows: { row: number; on: string; description: string; category: string | null; method: string | null; invoiceChecked: boolean; account: CashAccount; cents: number }[];
  year?: number;
  /** Rows of another year: left out, loaded in their own year, or counted in the year of the sheet. */
  outside: "skip" | "own" | "year";
}
export interface ApplyBody extends ImportBody {
  mode: "add" | "replace";
  confirmYear?: number;
  updateChanged: boolean;
  /** For a Voce or a method the site does not have: the id of one it has to use instead (none: create it). */
  categoryMap: Record<string, number | null>;
  methodMap: Record<string, number | null>;
}
