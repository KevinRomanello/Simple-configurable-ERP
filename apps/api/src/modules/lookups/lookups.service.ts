import { PRIORITIES, type BankCompareMode, type FundType, type Lookups, type Priority, type Quarter, type Settings, type StatementSpec, type VatRules } from "@erp/calc";
import { asc } from "drizzle-orm";
import { db } from "../../db/client";
import { category, categoryField, location, setting, unit, vatRate } from "../../db/schema";
import { getCurrentSeason } from "../seasons/seasons.service";
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

/**
 * The VAT rate a line starts from when its price is typed with the VAT in it and no rate is chosen yet, in
 * percent: the main one, which the person can change on the line.
 */
export async function getDefaultVatRate(): Promise<number> {
  // HARDCODED: the main VAT rate will be a value of the Settings page, chosen among the VAT rates
  return 22;
}

/**
 * The budget category of the lines of the derived area (what the team spends outside the budget, calculated from the
 * register). It is one of the categories of the Settings page, so it shows in the blocks of TOTAL and of the Gantt.
 */
export async function getDerivedAreaCategory(): Promise<string> {
  // HARDCODED: the category of the lines calculated from the register will be a value of the Settings page, chosen among the categories
  return "Administration";
}

/**
 * The rows of the financial statement, in the order and with the labels the team must show (they are copied from the
 * sheet "voci di ricavocosto", defects included: docs/registro-di-cassa.md). `row` is the row of that sheet, which
 * the sums refer to. A Voce of the register is counted in the row that has its name.
 */
export async function getStatementLayout(): Promise<StatementSpec[]> {
  // HARDCODED: the rows of the financial statement will be a list of the Settings page, kept by the admin
  return [
    { row: 1, kind: "title", label: "RICAVI", side: "in" },
    { row: 2, kind: "voce", label: "1. QUOTE ASSOCIATIVE", bold: true, paypal: false },
    { row: 3, kind: "sum", label: "2. CONTRIBUTI DEGLI ASSOCIATI E DEI TESSERATI", of: [4, 5, 6], total: false },
    { row: 4, kind: "voce", label: "2.1 da soci e tesserati", bold: false, paypal: true },
    { row: 5, kind: "voce", label: "2.2 da altre associazioni", bold: false, paypal: true },
    { row: 6, kind: "voce", label: "2.3 da altri (ad es. Federazioni)", bold: false, paypal: true },
    { row: 7, kind: "sum", label: "3. EROGAZIONI LIBERALI RICEVUTE", of: [8, 9], total: false },
    { row: 8, kind: "voce", label: "3.1 da soci", bold: false, paypal: true },
    { row: 9, kind: "voce", label: "3.2 da non soci", bold: false, paypal: true },
    { row: 10, kind: "sum", label: "4. CONTRIBUTI DA ENTI PUBBLICI", of: [11, 12, 13], total: false },
    { row: 11, kind: "voce", label: "4.1 da comune, provincia, regione, stato", bold: false, paypal: true },
    { row: 12, kind: "voce", label: "4.2 da Comunità europea e da altri organismi internazionali", bold: false, paypal: true },
    { row: 13, kind: "voce", label: "4.3 da 5 per mille", bold: false, paypal: true },
    { row: 14, kind: "voce", label: "4.4 da università", bold: false, paypal: true },
    { row: 15, kind: "voce", label: "5. ENTRATE DA ATTIVITA’ COMMERCIALI", bold: true, paypal: true },
    { row: 16, kind: "voce", label: "PRODUTTIVE MARGINALI (Eventi di raccolta fondi)", bold: false, paypal: true },
    { row: 17, kind: "sum", label: "TOTALE RICAVI DA ATTIVITA' ISTITUZIONALE (tipica)", of: [2, 3, 7, 10, 15], total: true },
    { row: 18, kind: "sum", label: "6. ENTRATE COMMERCIALI (da attività accessoria)", of: [19, 20, 21], total: false },
    { row: 19, kind: "voce", label: "6.1 Da pubblicità e sponsorizzazioni", bold: false, paypal: true },
    { row: 20, kind: "voce", label: "6.2 per attività svolte nei confronti di non associati", bold: false, paypal: true },
    { row: 21, kind: "voce", label: "6.3 Entrate commerciali di altro tipo (rimborsi)", bold: false, paypal: true },
    { row: 22, kind: "sum", label: "TOTALE RICAVI DA ATTIVITA' COMMERCIALE (accessoria)", of: [18], total: true },
    { row: 23, kind: "sum", label: "7. ALTRE ENTRATE", of: [24, 25, 26], total: false },
    { row: 24, kind: "voce", label: "7.1 Da rendite patrimoniali", bold: false, paypal: true },
    { row: 25, kind: "voce", label: "7.2 rendite finanziarie", bold: false, paypal: true },
    { row: 26, kind: "voce", label: "7.3 altro: CAMBI ATTIVI", bold: false, paypal: true },
    { row: 27, kind: "sum", label: "TOTALE RICAVI", of: [17, 22, 23], total: true },
    { row: 28, kind: "blank" },
    { row: 29, kind: "title", label: "COSTI", side: "out" },
    { row: 30, kind: "sum", label: "1. ACQUISTO DI BENI E DI MERCI", of: [31, 32, 33, 34], total: false },
    { row: 31, kind: "voce", label: "1.1 Attrezzature", bold: false, paypal: true },
    { row: 32, kind: "voce", label: "1.2 Cancelleria e materiali da ufficio", bold: false, paypal: false },
    { row: 33, kind: "voce", label: "1.3 Materiale sportivo (per le ASD)", bold: false, paypal: false },
    { row: 34, kind: "voce", label: "1.4 Altro", bold: false, paypal: true },
    { row: 35, kind: "sum", label: "2. ACQUISTO DI SERVIZI", of: [36, 37, 38, 39, 40], total: false },
    { row: 36, kind: "voce", label: "2.1 Assicurazioni", bold: false, paypal: true },
    { row: 37, kind: "voce", label: "2.2 Servizi informatici", bold: false, paypal: true },
    { row: 38, kind: "voce", label: "2.3 Spese postali", bold: false, paypal: true },
    { row: 39, kind: "voce", label: "2.4 Consulenze/ servizi contabili", bold: false, paypal: true },
    { row: 40, kind: "voce", label: "2.5 Altri", bold: false, paypal: true },
    { row: 41, kind: "sum", label: "3. UTENZE (telefono, luce, riscaldamento,…)", of: [42, 43, 44, 45], total: false },
    { row: 42, kind: "voce", label: "3.1 Luce", bold: false, paypal: true },
    { row: 43, kind: "voce", label: "3.2 Acqua", bold: false, paypal: true },
    { row: 44, kind: "voce", label: "3.3 Gas", bold: false, paypal: true },
    { row: 45, kind: "voce", label: "3.4 Altre", bold: false, paypal: true },
    { row: 46, kind: "sum", label: "4. GODIMENTO BENI DI TERZI (affitti e noleggi)", of: [47, 48, 49], total: false },
    { row: 47, kind: "voce", label: "4.1 Affitti", bold: false, paypal: true },
    { row: 48, kind: "voce", label: "4.2 Noleggi", bold: false, paypal: true },
    { row: 49, kind: "voce", label: "4.3 Altri", bold: false, paypal: true },
    { row: 50, kind: "sum", label: "5. AFFILIAZIONI E TESSERAMENTI", of: [51, 52], total: false },
    { row: 51, kind: "voce", label: "5.1 Affiliazioni a federazioni", bold: false, paypal: true },
    { row: 52, kind: "voce", label: "5.2 Altri", bold: false, paypal: true },
    { row: 53, kind: "sum", label: "6. COSTI PER COLLABORATORI", of: [54, 55, 56], total: false },
    { row: 54, kind: "voce", label: "6.1 Costi per collaboratori (occasionali, forfettari e dipendenti)", bold: false, paypal: true },
    { row: 55, kind: "voce", label: "6.2 Rimborsi spese analitici", bold: false, paypal: true },
    { row: 56, kind: "voce", label: "6.3 Altri costi", bold: false, paypal: true },
    { row: 57, kind: "sum", label: "7. COSTI BANCARI", of: [58, 59], total: false },
    { row: 58, kind: "voce", label: "7.1 Commissioni e spese tenuta conto", bold: false, paypal: true },
    { row: 59, kind: "voce", label: "7.2 Altri", bold: false, paypal: true },
    { row: 60, kind: "sum", label: "8. IMPOSTE E TASSE", of: [61, 62, 63, 64], total: false },
    { row: 61, kind: "voce", label: "8.1 IRES/IRAP", bold: false, paypal: true },
    { row: 62, kind: "voce", label: "8.2 Imposta di bollo", bold: false, paypal: true },
    { row: 63, kind: "voce", label: "8.3 Dazi doganali", bold: false, paypal: true },
    { row: 64, kind: "sum", label: "9. IVA", of: [65, 66, 67], total: false },
    { row: 65, kind: "voce", label: "9.1 IVA a credito", bold: false, paypal: true },
    { row: 66, kind: "voce", label: "9.2 IVA a debito", bold: false, paypal: true },
    { row: 67, kind: "voce", label: "9.3 Liquidazione IVA", bold: false, paypal: true },
    { row: 68, kind: "sum", label: "TOTALE COSTI", of: [30, 35, 41, 46, 50, 53, 57, 60], total: true },
    { row: 69, kind: "blank" },
    { row: 70, kind: "result", label: "AVANZO O DISAVANZO DI GESTIONE", plus: 27, minus: 68 },
  ];
}

/**
 * The VAT rate a kind of sponsor cannot choose, in percent: goods given for free owe no VAT, goods
 * given against an advertising counter-invoice always owe the same. The other kinds choose their own.
 */
export async function getFixedSponsorRates(): Promise<Partial<Record<FundType, number>>> {
  // HARDCODED: the VAT of the counter-invoice (11%) will be a value of the Settings page
  return { gift: 0, gift_vat: 11 };
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

/**
 * The default span of the per-area VAT report for the season starting in September of `startYear`:
 * its quarters and the deadlines after them. It widens by itself around the purchase dates.
 */
function vatReportHorizon(startYear: number): { from: Quarter; to: Quarter } {
  // HARDCODED: goes away when the VAT of the lines is paid on the payment date (docs/sponsor-e-fondi.md)
  return { from: { year: startYear, quarter: 3 }, to: { year: startYear + 1, quarter: 4 } };
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
    vatReportHorizon: vatReportHorizon(Number((await getCurrentSeason()).startsOn.slice(0, 4))),
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
    settings: { ...LOOKUP_DEFAULTS.settings, vatReportHorizon: vatReportHorizon(2026) }, // the old sheet is the budget 2026-27
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
  room: string;
  /** Empty when the place is the room itself. */
  shelf: string;
  /** A level of the shelf; empty when the place is the shelf itself. */
  level: string;
  label: string;
}

/** "Room 1 / Shelf A / 2": the parts a place has, in order. */
export const placeLabel = (place: { room: string; shelf: string; level: string }) =>
  [place.room, place.shelf, place.level].filter((part) => part !== "").join(" / ");

/** Where things can be kept, in their order. The precise spot inside a place ("red box") is free text. */
export async function listLocations(): Promise<Location[]> {
  const rows = await db.select().from(location).orderBy(asc(location.position), asc(location.id));
  return rows.map((r) => ({ code: r.code, room: r.room, shelf: r.shelf, level: r.level, label: placeLabel(r) }));
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
