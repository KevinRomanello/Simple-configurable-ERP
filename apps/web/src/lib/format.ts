// Italian does not group four-digit numbers by default ("1220,00 €"); a column of amounts reads
// better when 1.220,00 € and 10.000,00 € look alike.
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });
const percent = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 2 });

/** Cents as euros. `blankZero` hides zeros, like the number format of the old sheet. */
export function money(cents: number | null | undefined, blankZero = false): string {
  if (cents == null || (blankZero && cents === 0)) return "";
  return euro.format(cents / 100);
}

/** A decimal string from the API ("1234.50") as euros. */
export function moneyFromDecimal(amount: string | null | undefined): string {
  return amount == null ? "" : euro.format(Number(amount));
}

export const ratio = (value: number | null) => (value === null ? "" : percent.format(value));

/** 2026-11-20 -> 20/11/26, the format of the old sheet. */
export function date(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** 2026-11 -> nov 26. */
export function month(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y?.slice(2)}`;
}

/** "2026-11-15" (a bank date) shown as a month, as the old sheet did. */
export const monthOfDate = (iso: string | null) => (iso ? month(iso.slice(0, 7)) : "");
