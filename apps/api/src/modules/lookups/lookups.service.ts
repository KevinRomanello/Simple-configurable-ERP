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

/** Switches for the behaviours the treasurer still has to confirm (question Q2) and fixed rates. */
export async function getSettings(): Promise<Settings> {
  // HARDCODED: becomes the `setting` table / an admin page. Values reproduce the old script.
  return {
    varianceThreshold: 0.15,
    vatBaseWhenTotalSponsor: "net",
    // The ASD rule: 11% of the money a sponsor pays into the bank goes to the VAT, every quarter.
    cashSponsorVatRate: 11,
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

// --- inventory ---------------------------------------------------------------------------------

export interface Location {
  /** What is stored with a movement. */
  code: string;
  site: string;
  room: string;
  label: string;
}

/** Where things can be kept. The precise place inside a room ("shelf 2, red box") is free text. */
export async function listLocations(): Promise<Location[]> {
  // HARDCODED: becomes the `location` table (sites and rooms), kept by an admin. Two sites with
  // five rooms each, only to have something to choose from.
  const locations: Location[] = [];
  for (const site of [1, 2]) {
    for (const room of [1, 2, 3, 4, 5]) {
      locations.push({ code: `s${site}-r${room}`, site: `Site ${site}`, room: `Room ${room}`, label: `Site ${site} / Room ${room}` });
    }
  }
  return locations;
}

/** How an item is counted. */
export async function listUnits(): Promise<string[]> {
  // HARDCODED: becomes a configurable list
  return ["pcs", "set", "box", "m", "kg", "g", "l", "ml"];
}

/** The optional pieces of information of an item. Not all of them make sense for every category. */
export type ItemField = "purpose" | "safetyCodes" | "disposal" | "storageNotes" | "maintenanceNotes";

export interface CategoryFields {
  /** The fields of a category that is not listed (or of an item with no category). */
  fallback: ItemField[];
  byCategory: Record<string, ItemField[]>;
}

/** Which of the optional fields the form shows for each category. None of them is required. */
export async function getCategoryFields(): Promise<CategoryFields> {
  // HARDCODED: becomes a table (category x field), edited by an admin. Dangerous materials (resins,
  // solvents, batteries) are what the hazard codes and the disposal notes are for.
  return {
    fallback: ["purpose", "storageNotes"],
    byCategory: {
      Components: ["purpose", "storageNotes"],
      Manufacturing: ["purpose", "safetyCodes", "disposal", "storageNotes"],
      Consumable: ["purpose", "safetyCodes", "disposal", "storageNotes"],
      Asset: ["purpose", "maintenanceNotes", "storageNotes"],
      Logistic: ["purpose", "storageNotes"],
      Administration: ["purpose"],
      Software: ["purpose"],
    },
  };
}
