// The calls of treasury to the API (split from api/client.ts in G7: docs/moduli-architettura.md, §7.1).
import { del, get, patch, post, put } from "../../core/api";
import type { CashScope } from "../../core/calcTypes";
import type { ApplyBody, CashAccount, CashEntryBody, CashListItem, CashRegister, ImportBody, ImportPreview, ImportResult, Statement } from "./types";

export const treasuryApi = {
  // the register of the team's money (treasury and admins)
  cashRegister: (year?: number) => get<CashRegister>(`/treasury/register${year ? `?year=${year}` : ""}`),
  createCashEntry: (body: CashEntryBody) => post("/treasury/entries", body),
  updateCashEntry: (id: number, body: Partial<CashEntryBody>) => patch(`/treasury/entries/${id}`, body),
  deleteCashEntry: (id: number) => del(`/treasury/entries/${id}`),
  /** FINANCIAL STATEMENT: the table of income and costs of a year, as the sheet of the treasury works it out. */
  cashStatement: (year?: number) => get<Statement>(`/treasury/statement${year ? `?year=${year}` : ""}`),
  setCashOpening: (body: { year: number; account: CashAccount; amount: string | null }) => put("/treasury/openings", body),
  previewCashImport: (body: ImportBody) => post<ImportPreview>("/treasury/import/preview", body),
  applyCashImport: (body: ApplyBody) => post<ImportResult>("/treasury/import", body),
  cashCategories: () => get<CashListItem[]>("/treasury/categories"),
  createCashCategory: (body: { name: string; sponsorship?: boolean; scope?: CashScope }) => post("/treasury/categories", body),
  updateCashCategory: (id: number, body: { name?: string; sponsorship?: boolean; scope?: CashScope }) => patch(`/treasury/categories/${id}`, body),
  deleteCashCategory: (id: number) => del(`/treasury/categories/${id}`),
  orderCashCategories: (ids: number[]) => put("/treasury/categories/order", { ids }),
  cashMethods: () => get<CashListItem[]>("/treasury/methods"),
  createCashMethod: (name: string) => post("/treasury/methods", { name }),
  renameCashMethod: (id: number, name: string) => patch(`/treasury/methods/${id}`, { name }),
  deleteCashMethod: (id: number) => del(`/treasury/methods/${id}`),
  orderCashMethods: (ids: number[]) => put("/treasury/methods/order", { ids }),
};
