import { PRIORITIES, type Lookups, type Priority, type Settings, type VatRules } from "@erp/calc";

// Every value here is either a fixed domain enum or a "hardcoded for now" value that will become
// real configuration. The hardcoded ones live INSIDE the function that will later serve them
// (project rule 4) and are listed in docs/hardcoded-registry.md.

export async function listCategories(): Promise<string[]> {
  // HARDCODED: becomes the `category` table, editable by the admin
  return [
    "Components",
    "Manufacturing",
    "Consumable",
    "Asset",
    "Logistic",
    "Administration",
    "Software",
  ];
}

/** Fixed by design (red/orange/green in the sheet); not configurable. */
export async function listPriorities(): Promise<readonly Priority[]> {
  return PRIORITIES;
}

/** VAT rates a line can use, in percent. */
export async function listVatRates(): Promise<number[]> {
  // HARDCODED: becomes a configurable list
  return [0, 11, 22];
}

/** When the VAT of a purchase falls due (ASD, Legge 398/1991 quarterly planning). */
export async function getVatRules(): Promise<VatRules> {
  // HARDCODED: becomes the `vat_rule` table, validated with the accountant (open question Q3).
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

/** Switches for the behaviours the treasurer still has to confirm (questions Q1, Q2). */
export async function getSettings(): Promise<Settings> {
  // HARDCODED: becomes the `setting` table / an admin page. Values reproduce the old script.
  return {
    varianceThreshold: 0.15,
    vatBaseWhenTotalSponsor: "net",
    bankCompare: { summary: "day", timeline: "month" },
    vatReportHorizon: {
      from: { year: 2026, quarter: 3 },
      to: { year: 2027, quarter: 4 },
    },
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
