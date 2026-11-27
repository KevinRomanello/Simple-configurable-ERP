// The calls of treasury-budget to the API (split from api/client.ts in G7: docs/moduli-architettura.md, §7.1).
import { del, get, patch, post, put } from "../../core/api";
import type { CashAccount } from "../../modules/treasury/public";
import type { CategoryDefault, PayableLine, Receivable, RelatedInflows, ToLinkRow, ToPay } from "./types";

/** What the form of TO PAY sends: one new payment for the lines, with an amount for each. */
export interface PayBody {
  on: string;
  account: CashAccount;
  methodId: number | null;
  categoryId: number | null;
  description?: string;
  lines: { lineId: number; amount: string }[];
}

export const treasuryBudgetApi = {
  payableLines: () => get<PayableLine[]>("/treasury-budget/payable-lines"),
  /** TO PAY: what the team still owes of the lines bought, the payment that pays them, and the payments that pay no line yet. */
  toPay: (allSeasons: boolean) => get<ToPay>(`/treasury-budget/to-pay${allSeasons ? "?allSeasons=1" : ""}`),
  payLines: (body: PayBody) => post<{ id: number }>("/treasury-budget/to-pay/pay", body),
  toLink: () => get<ToLinkRow[]>("/treasury-budget/to-link"),
  /** The orders of TO PAY: lines bought together (a line that was in another order moves; an order left without lines goes). */
  createOrder: (body: { name: string; lineIds: number[] }) => post<{ id: number; name: string; seasonId: number }>("/treasury-budget/orders", body),
  updateOrder: (id: number, body: { name?: string; addLineIds?: number[]; removeLineIds?: number[] }) => patch(`/treasury-budget/orders/${id}`, body),
  /** Ungroups an order: its lines stay, without an order. */
  deleteOrder: (id: number) => del(`/treasury-budget/orders/${id}`),
  categoryDefaults: () => get<CategoryDefault[]>("/treasury-budget/category-voci"),
  setCategoryDefault: (categoryId: number, voceId: number | null) => put(`/treasury-budget/category-voci/${categoryId}`, { voceId }),
  setCashEntryLines: (id: number, lines: { lineId: number; amount: string }[]) => put(`/treasury-budget/entries/${id}/lines`, { lines }),
  relatedInflows: (from: { inflowId: number } | { cashEntryId: number }) =>
    get<RelatedInflows>(`/treasury-budget/inflows/related?${"inflowId" in from ? `inflowId=${from.inflowId}` : `cashEntryId=${from.cashEntryId}`}`),
  deleteInflows: (body: { inflowIds: number[]; cashEntryIds: number[] }) => post<void>("/treasury-budget/inflows/delete", body),
  receivable: () => get<Receivable[]>("/treasury-budget/inflows/receivable"),
  /** An expected inflow arrived: a new movement of the register, or one that is already there. */
  receiveInflow: (id: number, body: { entryId: number } | { on: string; account: CashAccount; amount?: string; categoryId?: number | null; methodId?: number | null }) =>
    post(`/treasury-budget/inflows/${id}/receive`, body),
  unreceiveInflow: (id: number) => del(`/treasury-budget/inflows/${id}/receive`),
};
