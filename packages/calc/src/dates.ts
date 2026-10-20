import type { Quarter, QuarterNumber } from "./types";

// Dates are ISO strings (YYYY-MM-DD) everywhere. Calendar arithmetic goes through UTC so the
// machine's time zone can never shift a day. Months are keyed as "YYYY-MM".

interface Ymd {
  year: number;
  month: number;
  day: number;
}

export function parseIso(iso: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function toIso({ year, month, day }: Ymd): string {
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function toUtc(iso: string): number {
  const { year, month, day } = parseIso(iso);
  return Date.UTC(year, month - 1, day);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

export function addDays(iso: string, days: number): string {
  const date = new Date(toUtc(iso) + days * 86_400_000);
  return toIso({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/** Saturday and Sunday move to the following Monday; other days are unchanged. */
export function nextMondayIfWeekend(iso: string): string {
  const day = weekday(iso);
  if (day === 6) return addDays(iso, 2);
  if (day === 0) return addDays(iso, 1);
  return iso;
}

/** "2026-11-20" -> "2026-11". */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function quarterOf(iso: string): Quarter {
  const { year, month } = parseIso(iso);
  return { year, quarter: (Math.floor((month - 1) / 3) + 1) as QuarterNumber };
}

/** A single increasing number per quarter, to compare and iterate over them. */
export function quarterIndex({ year, quarter }: Quarter): number {
  return year * 4 + (quarter - 1);
}

export function quarterFromIndex(index: number): Quarter {
  return { year: Math.floor(index / 4), quarter: ((index % 4) + 1) as QuarterNumber };
}

/** Every month key from `from` to `to`, both included. */
export function monthRange(from: string, to: string): string[] {
  const keys: string[] = [];
  let { year, month } = parseIso(`${from}-01`);
  const last = parseIso(`${to}-01`);
  while (year < last.year || (year === last.year && month <= last.month)) {
    keys.push(toIso({ year, month, day: 1 }).slice(0, 7));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/** Smallest and largest of a set of month keys, or null when the set is empty. */
export function monthSpan(keys: Iterable<string>): [string, string] | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const key of keys) {
    if (min === null || key < min) min = key;
    if (max === null || key > max) max = key;
  }
  return min === null || max === null ? null : [min, max];
}

const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function isRealDate({ year, month, day }: Ymd): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Reads the date notations the old sheet accepted, for the importer and for pasted text:
 * `dd/mm/yy(yy)`, `dd-mm-yy(yy)`, `mmm yy(yy)` with Italian or English month names (meaning the
 * 1st of that month) and ISO `yyyy-mm-dd`. Returns an ISO date, or null if it is not a real date.
 */
export function parseFlexibleDate(input: string): string | null {
  const text = input.trim().replace(/^'/, "");
  const full = (year: number) => (year < 100 ? year + 2000 : year);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    const ymd = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    return isRealDate(ymd) ? toIso(ymd) : null;
  }

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text);
  if (dmy) {
    const ymd = { year: full(Number(dmy[3])), month: Number(dmy[2]), day: Number(dmy[1]) };
    return isRealDate(ymd) ? toIso(ymd) : null;
  }

  const monthYear = /^([A-Za-zÀ-ÿ]{3,})\s+(\d{2}|\d{4})$/.exec(text);
  if (monthYear) {
    const name = monthYear[1]!.toLowerCase().slice(0, 3);
    const index = MONTHS_EN.includes(name) ? MONTHS_EN.indexOf(name) : MONTHS_IT.indexOf(name);
    if (index === -1) return null;
    return toIso({ year: full(Number(monthYear[2])), month: index + 1, day: 1 });
  }

  return null;
}
