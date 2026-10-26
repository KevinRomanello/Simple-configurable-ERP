import type { Settings } from "@erp/calc";

/** The optional pieces of information of an item, in the order the form shows them. */
export const ITEM_FIELDS = ["purpose", "safetyCodes", "disposal", "storageNotes", "maintenanceNotes"] as const;
export type ItemField = (typeof ITEM_FIELDS)[number];

/**
 * What the lists and the settings start with: the values of the old sheet. Migration 0010 writes
 * them into the database (from then on an admin changes them on the Settings page); the tests put
 * them back before each test; the reconciliation with the sheet uses them, so that it does not
 * depend on what an admin changed since.
 */
export const LOOKUP_DEFAULTS = {
  categories: [
    { name: "Components", fields: ["purpose", "storageNotes"] },
    { name: "Manufacturing", fields: ["purpose", "safetyCodes", "disposal", "storageNotes"] },
    { name: "Consumable", fields: ["purpose", "safetyCodes", "disposal", "storageNotes"] },
    { name: "Asset", fields: ["purpose", "maintenanceNotes", "storageNotes"] },
    { name: "Logistic", fields: ["purpose", "storageNotes"] },
    { name: "Administration", fields: ["purpose"] },
    { name: "Software", fields: ["purpose"] },
  ] satisfies { name: string; fields: ItemField[] }[],
  /** The fields of an item without a category. */
  uncategorizedFields: ["purpose", "storageNotes"] satisfies ItemField[],
  vatRates: [0, 11, 22],
  units: ["pcs", "set", "box", "m", "kg", "g", "l", "ml"],
  /** Two sites with five rooms each, only to have something to choose from. */
  locations: [1, 2].flatMap((site) => [1, 2, 3, 4, 5].map((room) => ({ code: `s${site}-r${room}`, site: `Site ${site}`, room: `Room ${room}` }))),
  settings: {
    varianceThreshold: 0.15,
    vatBaseWhenTotalSponsor: "net",
    inflowVatRate: 11,
    bankCompare: { summary: "day", timeline: "month" },
  } satisfies Omit<Settings, "vatReportHorizon">,
};
