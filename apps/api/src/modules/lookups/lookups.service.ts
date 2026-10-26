import { PRIORITIES, type BankCompareMode, type Lookups, type Priority, type Quarter, type Settings, type VatRules } from "@erp/calc";
import { asc } from "drizzle-orm";
import { db } from "../../db/client";
import { category, categoryField, location, setting, unit, vatRate } from "../../db/schema";
import { ITEM_FIELDS, LOOKUP_DEFAULTS, type ItemField } from "./defaults";

export { ITEM_FIELDS, type ItemField } from "./defaults";

// The lists and switches that an admin sets on the Settings page (docs/impostazioni.md), plus the
// fixed domain enums. What is still "hardcoded for now" lives INSIDE the function that will later
// serve it (project rule 4) and is listed in docs/hardcoded-registry.md.

/** The categories, in their order (the blocks of TOTAL and of the Gantt follow it). */
export async function listCategories(): Promise<string[]> {
  const rows = await db.select({ name: category.name }).from(category).orderBy(asc(category.position), asc(category.id));
  return rows.map((r) => r.name);
}

/** Fixed by design (red/orange/green in the sheet); not configurable. */
export async function listPriorities(): Promise<readonly Priority[]> {
  return PRIORITIES;
}

/** VAT rates a line can use, in percent. */
export async function listVatRates(): Promise<number[]> {
  const rows = await db.select({ rate: vatRate.rate }).from(vatRate).orderBy(asc(vatRate.rate));
  return rows.map((r) => Number(r.rate));
}

/** When the VAT of a purchase falls due (ASD, Legge 398/1991 quarterly planning). */
export async function getVatRules(): Promise<VatRules> {
  // HARDCODED: goes away when the VAT of the lines is paid on the payment date (docs/sponsor-e-fondi.md).
  // Purchases of Jan-Mar are due 16 May, Apr-Jun 20 Aug, Jul-Sep 16 Nov, Oct-Dec 16 Feb of the
  // next year. Weekends move to Monday; holidays and extraordinary extensions are not modelled.
  return {
    deadlines: [
      { quarter: 1, month: 5, day: 16, yearOffset: 0 },
      { quarter: 2, month: 8, day: 20, yearOffset: 0 },
      { quarter: 3, month: 11, day: 16, yearOffset: 0 },
      { quarter: 4, month: 2, day: 16, yearOffset: 1 },
    ],
    shiftWeekendToMonday: true,
  };
}

/** The default span of the per-area VAT report; it widens by itself around the purchase dates. */
function vatReportHorizon(): { from: Quarter; to: Quarter } {
  // HARDCODED: goes away when the VAT of the lines is paid on the payment date (docs/sponsor-e-fondi.md)
  return { from: { year: 2026, quarter: 3 }, to: { year: 2027, quarter: 4 } };
}

/** The switches of the calculation, as an admin set them on the Settings page. */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(setting);
  if (!row) throw new Error("The settings are missing: run the migrations (pnpm db:migrate)");
  return {
    varianceThreshold: Number(row.varianceThreshold),
    vatBaseWhenTotalSponsor: row.vatBaseWhenTotalSponsor as Settings["vatBaseWhenTotalSponsor"],
    inflowVatRate: Number(row.inflowVatRate),
    bankCompare: { summary: row.bankCompareSummary as BankCompareMode, timeline: row.bankCompareTimeline as BankCompareMode },
    vatReportHorizon: vatReportHorizon(),
  };
}

/**
 * The lookups of the old sheet, whatever an admin changed since: what the reconciliation with the
 * sheet compares with. No database needed.
 */
export async function defaultLookups(): Promise<Lookups> {
  return {
    categories: LOOKUP_DEFAULTS.categories.map((c) => c.name),
    priorities: PRIORITIES,
    vatRates: LOOKUP_DEFAULTS.vatRates,
    vatRules: await getVatRules(),
    settings: { ...LOOKUP_DEFAULTS.settings, vatReportHorizon: vatReportHorizon() },
  };
}

/** All lookups in the shape the calculation engine wants them (part of every snapshot). */
export async function loadLookups(): Promise<Lookups> {
  const [categories, priorities, vatRates, vatRules, settings] = await Promise.all([
    listCategories(),
    listPriorities(),
    listVatRates(),
    getVatRules(),
    getSettings(),
  ]);
  return { categories, priorities, vatRates, vatRules, settings };
}

// --- inventory ---------------------------------------------------------------------------------

export interface Location {
  /** What is stored with a movement. */
  code: string;
  site: string;
  room: string;
  label: string;
}

/** Where things can be kept, in their order. The precise place inside a room ("shelf 2, red box") is free text. */
export async function listLocations(): Promise<Location[]> {
  const rows = await db.select().from(location).orderBy(asc(location.position), asc(location.id));
  return rows.map((r) => ({ code: r.code, site: r.site, room: r.room, label: `${r.site} / ${r.room}` }));
}

/** How an item is counted. */
export async function listUnits(): Promise<string[]> {
  const rows = await db.select({ name: unit.name }).from(unit).orderBy(asc(unit.id));
  return rows.map((r) => r.name);
}

export interface CategoryFields {
  /** The fields of a category that is not listed (or of an item with no category). */
  fallback: ItemField[];
  byCategory: Record<string, ItemField[]>;
}

/** Which of the optional fields the form shows for each category. None of them is required. */
export async function getCategoryFields(): Promise<CategoryFields> {
  const [categories, rows] = await Promise.all([
    db.select({ id: category.id, name: category.name }).from(category),
    db.select().from(categoryField),
  ]);
  // always in the order of the form
  const fieldsOf = (categoryId: number | null) =>
    ITEM_FIELDS.filter((f) => rows.some((r) => r.categoryId === categoryId && r.field === f)) as ItemField[];
  return {
    fallback: fieldsOf(null),
    byCategory: Object.fromEntries(categories.map((c) => [c.name, fieldsOf(c.id)])),
  };
}
