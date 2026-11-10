// The register of the team's money: running balances and the matching of a sheet against it.
// Pure, like the rest of the engine: money in cents, dates as ISO strings. docs/registro-di-cassa.md

export const CASH_ACCOUNTS = ["cash", "bank", "paypal"] as const;
export type CashAccount = (typeof CASH_ACCOUNTS)[number];
export type Balances = Record<CashAccount, number>;

export interface RegisterEntry {
  id: number;
  /** The day, YYYY-MM-DD. */
  on: string;
  description: string;
  categoryId: number | null;
  methodId: number | null;
  account: CashAccount;
  /** Positive for money in, negative for money out; never zero. */
  cents: number;
  invoiceChecked: boolean;
  sponsorship: boolean;
}

/** What an account held on 1 January of a year. */
export interface Opening {
  year: number;
  account: CashAccount;
  cents: number;
}

export const zeroBalances = (): Balances => ({ cash: 0, bank: 0, paypal: 0 });

/** The team's money in the cash box and in the bank, which is what the sheet adds up (Paypal stays apart). */
export const totalOf = (balances: Balances): number => balances.cash + balances.bank;

export interface RegisterRow {
  entry: RegisterEntry;
  /** Every account after this movement. */
  balances: Balances;
}

export interface YearBalances {
  opening: Balances;
  closing: Balances;
}

export interface Timeline {
  rows: RegisterRow[];
  /** One per year that has an opening or a movement. */
  years: Map<number, YearBalances>;
}

const yearOf = (date: string) => Number(date.slice(0, 4));

/**
 * The running balances of every account, year after year. A year starts from where the year before
 * ended, unless an opening says otherwise for an account. Movements go by day, then by id.
 */
export function registerTimeline(entries: RegisterEntry[], openings: Opening[]): Timeline {
  const sorted = [...entries].sort((a, b) => a.on.localeCompare(b.on) || a.id - b.id);
  const yearList = [...new Set([...sorted.map((e) => yearOf(e.on)), ...openings.map((o) => o.year)])].sort((a, b) => a - b);
  const running = zeroBalances();
  const rows: RegisterRow[] = [];
  const years = new Map<number, YearBalances>();
  for (const year of yearList) {
    for (const o of openings) if (o.year === year) running[o.account] = o.cents;
    const opening = { ...running };
    for (const entry of sorted.filter((e) => yearOf(e.on) === year)) {
      running[entry.account] += entry.cents;
      rows.push({ entry, balances: { ...running } });
    }
    years.set(year, { opening, closing: { ...running } });
  }
  return { rows, years };
}

/**
 * What the accounts held at the end of `date`. Null when the register cannot say: it knows nothing
 * before its first opening balance, so a few stray movements of an earlier year do not make a
 * balance, and a BANK written by hand can stay in charge.
 */
export function balancesAt(entries: RegisterEntry[], openings: Opening[], date: string): Balances | null {
  const known = entries.filter((e) => e.on <= date);
  const opened = openings.filter((o) => o.year <= yearOf(date));
  if (opened.length === 0) return null;
  const { years } = registerTimeline(known, opened);
  const last = [...years.keys()].sort((a, b) => a - b).at(-1);
  return last === undefined ? null : years.get(last)!.closing;
}

// --- the sheet against the register (the import) -----------------------------------------------

/** One row of the sheet, with the Voce and the method as written (the site's lists are looked up by name). */
export interface SheetEntry {
  /** The row of the sheet, to tell the person where a problem is. */
  row: number;
  on: string;
  description: string;
  category: string | null;
  method: string | null;
  account: CashAccount;
  cents: number;
  invoiceChecked: boolean;
}

/** An entry of the register with its Voce and method by name, to compare with the sheet. */
export interface SiteEntry {
  id: number;
  on: string;
  description: string;
  category: string | null;
  method: string | null;
  account: CashAccount;
  cents: number;
  invoiceChecked: boolean;
}

export type ChangedField = "description" | "category" | "method" | "invoiceChecked";

export interface Changed {
  row: number;
  entryId: number;
  fields: ChangedField[];
}

export interface RegisterMatch {
  /** Rows of the sheet that are already in the register, as they are. */
  same: number;
  /** The same movement (day, account, amount) with something written differently. */
  changed: Changed[];
  /** Rows of the sheet (by sheet row) that the register does not have. */
  added: number[];
  /** Entries of the register (by id) that the sheet does not have. */
  onlySite: number[];
}

/** Text compared without caring about case, spaces or the kind of apostrophe. */
export const normalizeText = (text: string | null): string =>
  (text ?? "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();

const sameDay = (r: { on: string; account: string; cents: number }) => `${r.on}|${r.account}|${r.cents}`;
const sameText = (r: { on: string; account: string; cents: number; description: string }) => `${sameDay(r)}|${normalizeText(r.description)}`;

function differences(sheet: SheetEntry, site: SiteEntry): ChangedField[] {
  const fields: ChangedField[] = [];
  if (normalizeText(sheet.description) !== normalizeText(site.description)) fields.push("description");
  if (normalizeText(sheet.category) !== normalizeText(site.category)) fields.push("category");
  if (normalizeText(sheet.method) !== normalizeText(site.method)) fields.push("method");
  if (sheet.invoiceChecked !== site.invoiceChecked) fields.push("invoiceChecked");
  return fields;
}

function take<T>(groups: Map<string, T[]>, key: string, prefer?: (item: T) => boolean): T | undefined {
  const group = groups.get(key);
  if (!group || group.length === 0) return undefined;
  const at = Math.max(0, prefer ? group.findIndex(prefer) : 0);
  return group.splice(at, 1)[0];
}

function grouped<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

/**
 * Pairs the rows of a sheet with the entries of the register. First the identical ones (day, account,
 * amount and text), counting repetitions: two fees of the same amount on the same day are two movements.
 * Then, what is left is paired by day, account and amount alone: the same movement written differently.
 * Rows of the sheet without a partner are new; entries without a partner are only in the register.
 */
export function matchRegister(sheet: SheetEntry[], site: SiteEntry[]): RegisterMatch {
  const result: RegisterMatch = { same: 0, changed: [], added: [], onlySite: [] };
  const byText = grouped([...site].sort((a, b) => a.id - b.id), sameText);
  const left: SheetEntry[] = [];

  for (const row of sheet) {
    const partner = take(byText, sameText(row), (s) => differences(row, s).length === 0);
    if (!partner) left.push(row);
    else {
      const fields = differences(row, partner);
      if (fields.length === 0) result.same += 1;
      else result.changed.push({ row: row.row, entryId: partner.id, fields });
    }
  }

  const remaining = [...byText.values()].flat().sort((a, b) => a.id - b.id);
  const byDay = grouped(remaining, sameDay);
  for (const row of left) {
    const partner = take(byDay, sameDay(row));
    if (partner) result.changed.push({ row: row.row, entryId: partner.id, fields: differences(row, partner) });
    else result.added.push(row.row);
  }
  result.onlySite = [...byDay.values()].flat().map((s) => s.id).sort((a, b) => a - b);
  return result;
}
