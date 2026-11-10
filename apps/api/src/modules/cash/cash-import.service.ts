import {
  matchRegister, normalizeText, registerTimeline, zeroBalances,
  type Balances, type CashAccount, type Changed, type SheetEntry, type SiteEntry,
} from "@erp/calc";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { invalid } from "../../core/errors";
import { fromCents, toCents } from "../../core/money";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { cashCategory, cashEntry, cashMethod, cashOpening } from "../../db/schema";
import { loadRegister, assertCanManageCash } from "./cash.service";
import type { ApplyInput, SheetInput, SheetRowInput } from "./cash.schema";

// Loading the sheet of the treasury into the register (docs/registro-di-cassa.md, "L'import"):
// first a check that saves nothing, then one of two ways of applying it.

type Reader = Pick<Tx, "select">;
const yearOf = (date: string) => Number(date.slice(0, 4));

/** The year most rows of the sheet are in. */
function usualYear(rows: SheetRowInput[]): number {
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(yearOf(r.on), (counts.get(yearOf(r.on)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? Number(new Date().getFullYear());
}

const asSheetEntry = (r: SheetRowInput): SheetEntry => ({
  row: r.row, on: r.on, description: r.description, category: r.category, method: r.method, account: r.account, cents: r.cents, invoiceChecked: r.invoiceChecked,
});

/** The movements of a year as the sheet is compared with them: Voce and method by name. */
async function siteEntries(reader: Reader, year: number): Promise<SiteEntry[]> {
  const rows = await reader
    .select({ entry: cashEntry, category: cashCategory.name, method: cashMethod.name })
    .from(cashEntry)
    .leftJoin(cashCategory, eq(cashCategory.id, cashEntry.categoryId))
    .leftJoin(cashMethod, eq(cashMethod.id, cashEntry.methodId))
    .where(and(gte(cashEntry.entryOn, `${year}-01-01`), lte(cashEntry.entryOn, `${year}-12-31`)))
    .orderBy(asc(cashEntry.entryOn), asc(cashEntry.id));
  return rows.map(({ entry, category, method }) => ({
    id: entry.id, on: entry.entryOn, description: entry.description, category, method, account: entry.account, cents: toCents(entry.amount), invoiceChecked: entry.invoiceChecked,
  }));
}

export type Outside = "skip" | "own" | "year";

/** The same day and month in another year (29 February in a year without one is the 28th). */
function inYear(date: string, year: number): string {
  const day = date.slice(4);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}${day === "-02-29" && !leap ? "-02-28" : day}`;
}

/** The rows that count for a year: its own, and what is done with the ones of other years. */
function rowsFor(input: SheetInput, year: number, outside: Outside): SheetRowInput[] {
  if (outside === "own") return input.rows;
  return input.rows
    .filter((r) => outside === "year" || yearOf(r.on) === year)
    .map((r) => (yearOf(r.on) === year ? r : { ...r, on: inYear(r.on, year) }));
}

function unknownNames(names: (string | null)[], known: string[]): { name: string; rows: number }[] {
  const have = new Set(known.map(normalizeText));
  const counts = new Map<string, { name: string; rows: number }>();
  for (const name of names) {
    if (name === null || name.trim() === "" || have.has(normalizeText(name))) continue;
    const key = normalizeText(name);
    counts.set(key, { name: name.trim(), rows: (counts.get(key)?.rows ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
}

/** What the sheet would give, year by year, with the balances worked out from its own rows. */
function sheetBalances(input: SheetInput, rows: SheetRowInput[], year: number): Balances {
  const opening = input.opening?.cents ?? zeroBalances();
  const entries = rows.map((r) => ({ id: r.row, on: r.on, description: "", categoryId: null, methodId: null, account: r.account, cents: r.cents, invoiceChecked: false, sponsorship: false }));
  const { years } = registerTimeline(entries, (Object.keys(opening) as CashAccount[]).map((account) => ({ year, account, cents: opening[account] })));
  return years.get(year)?.closing ?? opening;
}

/** The check: what is in the sheet against what is in the register, saving nothing. */
export async function previewImport(input: SheetInput, options: { year?: number; outside: Outside }) {
  await assertCanManageCash();
  const year = options.year ?? usualYear(input.rows);
  const rows = rowsFor(input, year, options.outside);
  const outside = input.rows.filter((r) => yearOf(r.on) !== year);
  const outsideEffect = zeroBalances();
  for (const r of outside) outsideEffect[r.account] += r.cents;
  const [site, categories, methods, register] = await Promise.all([
    siteEntries(db, year),
    db.select({ name: cashCategory.name, sponsorship: cashCategory.sponsorship }).from(cashCategory),
    db.select({ name: cashMethod.name }).from(cashMethod),
    loadRegister(),
  ]);
  const match = matchRegister(rows.filter((r) => yearOf(r.on) === year).map(asSheetEntry), site);
  const byRow = new Map(rows.map((r) => [r.row, r]));
  const siteById = new Map(site.map((s) => [s.id, s]));
  const defaultSponsorship = new Set(categories.filter((c) => c.sponsorship).map((c) => normalizeText(c.name)));
  const years = new Map<number, number>();
  for (const r of input.rows) years.set(yearOf(r.on), (years.get(yearOf(r.on)) ?? 0) + 1);
  const closing = registerTimeline(register.entries, register.openings).years.get(year)?.closing ?? zeroBalances();

  return {
    year,
    years: [...years.entries()].map(([y, n]) => ({ year: y, rows: n })).sort((a, b) => a.year - b.year),
    rows: { total: input.rows.length, used: rows.length, outsideYear: outside.length },
    outside: outside.slice(0, 50).map((r) => ({ row: r.row, on: r.on, description: r.description, account: r.account, cents: r.cents })),
    /** What the rows of other years add to each account: with them left out, the balances part from the sheet's by this. */
    outsideEffect,
    same: match.same,
    changed: match.changed.slice(0, 200).map((c) => ({ ...c, description: byRow.get(c.row)?.description ?? "", siteDescription: siteById.get(c.entryId)?.description ?? "" })),
    changedCount: match.changed.length,
    added: match.added.slice(0, 500).map((row) => ({ row, on: byRow.get(row)!.on, description: byRow.get(row)!.description, account: byRow.get(row)!.account, cents: byRow.get(row)!.cents })),
    addedCount: match.added.length,
    onlySite: match.onlySite.length,
    noCategory: rows.filter((r) => r.category === null || r.category.trim() === "").length,
    unknownCategories: unknownNames(rows.map((r) => r.category), categories.map((c) => c.name)),
    unknownMethods: unknownNames(rows.map((r) => r.method), methods.map((m) => m.name)),
    sponsorshipAdded: match.added.filter((row) => byRow.get(row)!.cents > 0 && defaultSponsorship.has(normalizeText(byRow.get(row)!.category))).length,
    balances: { sheet: sheetBalances(input, rows.filter((r) => yearOf(r.on) === year), year), site: closing },
    hasOpening: input.opening !== null,
  };
}

// --- applying --------------------------------------------------------------------------------------

/** The ids of the Voci or methods of the sheet, creating (or mapping) the ones the site does not have yet. */
async function resolveNames(
  tx: Tx,
  table: typeof cashCategory | typeof cashMethod,
  names: (string | null)[],
  mapped: Record<string, number | null>,
): Promise<{ idOf: (name: string | null) => number | null; sponsorship: (name: string | null) => boolean }> {
  const rows = await tx.select().from(table);
  const ids = new Map<string, number>(rows.map((r) => [normalizeText(r.name), r.id]));
  const sponsorship = new Map<string, boolean>(rows.map((r) => [normalizeText(r.name), "sponsorship" in r ? (r.sponsorship as boolean) : false]));
  const [last] = await tx.select({ position: sql<number>`coalesce(max(${table.position}), 0)::int` }).from(table);
  let position = last?.position ?? 0;
  for (const name of names) {
    if (name === null || name.trim() === "" || ids.has(normalizeText(name))) continue;
    const target = mapped[name.trim()];
    if (target != null) {
      if (!rows.some((r) => r.id === target)) throw invalid(`"${name}" is mapped to something that does not exist`);
      ids.set(normalizeText(name), target);
      sponsorship.set(normalizeText(name), Boolean(rows.find((r) => r.id === target && "sponsorship" in r && r.sponsorship)));
      continue;
    }
    position += 1;
    const [created] = await tx.insert(table).values({ name: name.trim(), position }).returning({ id: table.id });
    ids.set(normalizeText(name), created!.id);
    sponsorship.set(normalizeText(name), false);
  }
  return {
    idOf: (name) => (name === null || name.trim() === "" ? null : (ids.get(normalizeText(name)) ?? null)),
    sponsorship: (name) => sponsorship.get(normalizeText(name)) ?? false,
  };
}

/**
 * Applies the sheet. `add`: what the register does not have is added, nothing is deleted, and the rows
 * with something written differently are changed only if asked. `replace`: the year's movements are
 * deleted and the sheet is loaded as it is, with its opening balances. One transaction either way.
 */
export async function applyImport(input: ApplyInput) {
  const actor = await assertCanManageCash();
  const year = input.year ?? usualYear(input.rows);
  if (input.mode === "replace" && input.confirmYear !== year) throw invalid(`Type the year ${year} to confirm that its movements are replaced`);
  const rows = rowsFor(input, year, input.outside);

  return runWrite(actor, async (tx) => {
    const categories = await resolveNames(tx, cashCategory, rows.map((r) => r.category), input.categoryMap);
    const methods = await resolveNames(tx, cashMethod, rows.map((r) => r.method), input.methodMap);
    const values = (r: SheetRowInput) => ({
      entryOn: r.on,
      description: r.description.trim(),
      categoryId: categories.idOf(r.category),
      methodId: methods.idOf(r.method),
      account: r.account,
      amount: fromCents(r.cents),
      invoiceChecked: r.invoiceChecked,
      sponsorship: r.cents > 0 && categories.sponsorship(r.category),
    });
    const insert = async (list: SheetRowInput[]) => {
      for (let i = 0; i < list.length; i += 500) await tx.insert(cashEntry).values(list.slice(i, i + 500).map(values));
    };
    const result = { mode: input.mode, year, added: 0, deleted: 0, updated: 0, openings: 0 };

    if (input.mode === "replace") {
      const deleted = await tx
        .delete(cashEntry)
        .where(and(gte(cashEntry.entryOn, `${year}-01-01`), lte(cashEntry.entryOn, `${year}-12-31`)))
        .returning({ id: cashEntry.id });
      result.deleted = deleted.length;
      await insert(rows);
      result.added = rows.length;
    } else {
      const inYear = rows.filter((r) => yearOf(r.on) === year);
      const match = matchRegister(inYear.map(asSheetEntry), await siteEntries(tx, year));
      const added = new Set(match.added);
      // rows of other years that were asked for are plain additions of their own year
      const outside = rows.filter((r) => yearOf(r.on) !== year);
      const outsideMatch = outside.length > 0 ? matchOutside(outside, await siteEntriesOf(tx, outside)) : new Set<number>();
      const toAdd = [...inYear.filter((r) => added.has(r.row)), ...outside.filter((r) => outsideMatch.has(r.row))];
      await insert(toAdd);
      result.added = toAdd.length;
      if (input.updateChanged) result.updated = await updateChanged(tx, match.changed, new Map(rows.map((r) => [r.row, r])), values);
    }

    if (input.opening) result.openings = await setOpenings(tx, year, input.opening.cents, input.mode === "replace");
    return result;
  });
}

/** Rows of other years, one year at a time against the register: which ones it does not have. */
async function siteEntriesOf(tx: Tx, rows: SheetRowInput[]): Promise<Map<number, SiteEntry[]>> {
  const years = [...new Set(rows.map((r) => yearOf(r.on)))];
  return new Map(await Promise.all(years.map(async (y) => [y, await siteEntries(tx, y)] as const)));
}

function matchOutside(rows: SheetRowInput[], site: Map<number, SiteEntry[]>): Set<number> {
  const added = new Set<number>();
  for (const [y, entries] of site) for (const row of matchRegister(rows.filter((r) => yearOf(r.on) === y).map(asSheetEntry), entries).added) added.add(row);
  return added;
}

async function updateChanged(
  tx: Tx,
  changed: Changed[],
  byRow: Map<number, SheetRowInput>,
  values: (r: SheetRowInput) => { description: string; categoryId: number | null; methodId: number | null; invoiceChecked: boolean },
): Promise<number> {
  for (const c of changed) {
    const { description, categoryId, methodId, invoiceChecked } = values(byRow.get(c.row)!);
    await tx.update(cashEntry).set({ description, categoryId, methodId, invoiceChecked }).where(eq(cashEntry.id, c.entryId));
  }
  return changed.length;
}

/** The opening balances of the sheet for the year: replacing sets them all; adding fills only the ones not typed yet. */
async function setOpenings(tx: Tx, year: number, cents: Balances, overwrite: boolean): Promise<number> {
  const existing = new Set((await tx.select({ account: cashOpening.account }).from(cashOpening).where(eq(cashOpening.year, year))).map((o) => o.account));
  let written = 0;
  for (const account of Object.keys(cents) as CashAccount[]) {
    if (!overwrite && existing.has(account)) continue;
    await tx
      .insert(cashOpening)
      .values({ year, account, amount: fromCents(cents[account]) })
      .onConflictDoUpdate({ target: [cashOpening.year, cashOpening.account], set: { amount: fromCents(cents[account]) } });
    written += 1;
  }
  return written;
}
