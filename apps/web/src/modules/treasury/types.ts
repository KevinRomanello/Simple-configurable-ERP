// The shapes of the answers of treasury (split from api/types.ts in G7: docs/moduli-architettura.md, §7.1).
import type { CashScope, StatementRow } from "@erp/calc";

/** GET /api/treasury/statement: the financial statement of a calendar year (the table of the sheet). */
export interface Statement {
  year: number;
  /** The years of the register, the current one included, newest first. */
  years: number[];
  rows: StatementRow[];
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
  /** Voci only: where its money counts (on a budget line, in the derived area, or nowhere). */
  scope?: CashScope;
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
/** GET /api/treasury/register */
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
/** POST /api/treasury/import/preview: what the sheet holds against what the register holds, nothing saved. */
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
/** POST /api/treasury/import */
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
