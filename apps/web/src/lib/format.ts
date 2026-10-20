// Amounts are formatted by hand from integer cents instead of with Intl.NumberFormat: how Intl
// groups digits ("1220,00" or "1.220,00") depends on the engine's version, and a column of
// amounts must look the same everywhere.

const NBSP = " ";

/** "1220000" -> "1.220.000". */
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Cents as euros ("1.220,00 €"). `blankZero` hides zeros, like the number format of the old sheet. */
export function money(cents: number | null | undefined, blankZero = false): string {
  if (cents == null || (blankZero && cents === 0)) return "";
  const abs = Math.abs(cents);
  const units = group(String(Math.floor(abs / 100)));
  return `${cents < 0 ? "-" : ""}${units},${String(abs % 100).padStart(2, "0")}${NBSP}€`;
}

/** Whole euros, for chart axes ("1.220 €"). */
export function moneyShort(euros: number): string {
  const rounded = Math.round(euros);
  return `${rounded < 0 ? "-" : ""}${group(String(Math.abs(rounded)))}${NBSP}€`;
}

/** A decimal string from the API ("1234.50") as euros, without going through floating point. */
export function moneyFromDecimal(amount: string | null | undefined): string {
  if (amount == null) return "";
  const [whole = "0", fraction = ""] = amount.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return money(amount.startsWith("-") ? -cents : cents);
}

const percent = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 2 });

export const ratio = (value: number | null) => (value === null ? "" : percent.format(value));

/** 2026-11-20 -> 20/11/26, the format of the old sheet. */
export function date(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

/** An instant as local time: 20/11/26 14:05. */
export function dateTime(iso: string): string {
  const moment = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(moment.getDate())}/${two(moment.getMonth() + 1)}/${String(moment.getFullYear()).slice(2)} ${two(moment.getHours())}:${two(moment.getMinutes())}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** 2026-11 -> nov 26. */
export function month(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y?.slice(2)}`;
}

/** "2026-10-15" (a bank date) shown as a month, as the old sheet did. */
export const monthOfDate = (iso: string | null) => (iso ? month(iso.slice(0, 7)) : "");
