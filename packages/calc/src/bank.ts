import { monthKey } from "./dates";
import type { BankCompareMode } from "./types";

/**
 * Whether `date` comes after the date of the BANK balance (open question Q2).
 * `day` compares full dates; `month` compares only the calendar month, so everything in the
 * month of the balance counts as already included in it. A missing date is never "after".
 */
export function isAfterBank(date: string | null, bankDate: string, mode: BankCompareMode): boolean {
  if (!date) return false;
  return mode === "day" ? date > bankDate : monthKey(date) > monthKey(bankDate);
}
