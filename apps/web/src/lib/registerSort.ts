import { CASH_ACCOUNTS } from "@erp/calc";
import type { CashEntryRow, CashListItem } from "../api/types";
import type { SortAccessors } from "./sort";

/** The name of the item of a list with this id, or empty. */
export const nameIn = (list: CashListItem[], id: number | null) => list.find((i) => i.id === id)?.name ?? "";

/**
 * What each header of the register sorts by. The three columns of an account are its money in, its money out
 * (both empty on a movement of another account) and its balance after the movement. Empty cells go last,
 * whatever the direction (the rule of every table).
 */
export function registerSort(voci: CashListItem[], methods: CashListItem[]): SortAccessors<CashEntryRow> {
  const accounts = CASH_ACCOUNTS.flatMap((account): [string, (e: CashEntryRow) => number | null][] => [
    [`${account}.in`, (e) => (e.account === account && e.cents > 0 ? e.cents : null)],
    [`${account}.out`, (e) => (e.account === account && e.cents < 0 ? -e.cents : null)],
    [`${account}.balance`, (e) => e.balances[account]],
  ]);
  return {
    on: (e) => e.on,
    description: (e) => e.description || null,
    voce: (e) => nameIn(voci, e.categoryId) || null,
    method: (e) => nameIn(methods, e.methodId) || null,
    invoice: (e) => (e.invoiceChecked ? 1 : 0),
    sponsorship: (e) => (e.sponsorship ? 1 : 0),
    total: (e) => e.total,
    ...Object.fromEntries(accounts),
  };
}
