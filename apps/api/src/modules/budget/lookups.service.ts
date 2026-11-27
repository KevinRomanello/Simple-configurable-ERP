import { PRIORITIES, type BankCompareMode, type FundType, type Lookups, type Priority, type Quarter, type Settings, type VatRules } from "@erp/calc";
import { eq } from "drizzle-orm";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { setting } from "../../db/schema/platform";
import { getCurrentUser, requireAdmin } from "../../platform/auth/auth.service";
import { LOOKUP_DEFAULTS } from "../../platform/lookups/defaults";
import { listCategories, listVatRates } from "../../platform/lookups/lookups.service";
import { getCurrentSeason } from "../../platform/seasons/seasons.service";

// The budget's lists and switches (docs/impostazioni.md): the priorities, what the VAT of a sponsor and of a purchase is, and the switches of
// the calculation an admin sets on the Settings page (they are columns of the core's `setting` row, which only the budget reads). Until G6 they
// were in the core (platform/lookups). What is still "hardcoded for now" lives INSIDE the function that will later serve it (project rule 4) and
// is listed in docs/hardcoded-registry.md.

/** Fixed by design (red/orange/green in the sheet); not configurable. */
export async function listPriorities(): Promise<readonly Priority[]> {
  return PRIORITIES;
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

export interface CalculationInput {
  varianceThreshold?: number;
  vatBaseWhenTotalSponsor?: "net" | "net-minus-sponsor";
  inflowVatRate?: number;
  bankCompare?: { summary?: "day" | "month"; timeline?: "day" | "month" };
}

/** Changes the switches of the calculation (admins); what is left out stays as it is. Every page uses them at once. */
export async function updateCalculation(input: CalculationInput) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  await runWrite(actor, async (tx) => {
    await tx
      .update(setting)
      .set({
        ...(input.varianceThreshold !== undefined ? { varianceThreshold: input.varianceThreshold.toFixed(4) } : {}),
        ...(input.vatBaseWhenTotalSponsor !== undefined ? { vatBaseWhenTotalSponsor: input.vatBaseWhenTotalSponsor } : {}),
        ...(input.inflowVatRate !== undefined ? { inflowVatRate: input.inflowVatRate.toFixed(2) } : {}),
        ...(input.bankCompare?.summary !== undefined ? { bankCompareSummary: input.bankCompare.summary } : {}),
        ...(input.bankCompare?.timeline !== undefined ? { bankCompareTimeline: input.bankCompare.timeline } : {}),
      })
      .where(eq(setting.id, 1));
  });
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
