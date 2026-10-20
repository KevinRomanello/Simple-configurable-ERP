// Builders for tests only (not exported from index.ts): small snapshots with the same lookup
// values the API serves, so a test states only what it is about.
import type { Figures, LineInput, Snapshot } from "./snapshot";
import type { Settings, VatRules } from "./types";

export const vatRules: VatRules = {
  deadlines: [
    { quarter: 1, month: 5, day: 16, yearOffset: 0 },
    { quarter: 2, month: 8, day: 20, yearOffset: 0 },
    { quarter: 3, month: 11, day: 16, yearOffset: 0 },
    { quarter: 4, month: 2, day: 16, yearOffset: 1 },
  ],
  shiftWeekendToMonday: true,
};

export const settings: Settings = {
  varianceThreshold: 0.15,
  vatBaseWhenTotalSponsor: "net",
  bankCompare: { summary: "day", timeline: "month" },
  vatReportHorizon: { from: { year: 2026, quarter: 3 }, to: { year: 2027, quarter: 4 } },
};

export const categories = [
  "Components",
  "Manufacturing",
  "Consumable",
  "Asset",
  "Logistic",
  "Administration",
  "Software",
];

/** Figures for `qty` units at `unitEuros` each; every other field is empty unless overridden. */
export function figures(qty: number, unitEuros: number, overrides: Partial<Figures> = {}): Figures {
  return {
    quantityMilli: Math.round(qty * 1000),
    unitCostE4: Math.round(unitEuros * 10_000),
    sponsorType: "none",
    sponsorValueCents: null,
    vatRate: 22,
    fundId: null,
    supplierId: null,
    purchaseDate: null,
    arrivalDate: null,
    ...overrides,
  };
}

export function line(
  id: number,
  projectId: number,
  estimate: Figures | null,
  actual: Figures | null = null,
  overrides: Partial<LineInput> = {},
): LineInput {
  return {
    id,
    projectId,
    position: id,
    item: `Item ${id}`,
    category: null,
    priority: null,
    note: null,
    version: 1,
    figures: { estimate, actual },
    ...overrides,
  };
}

/** A snapshot with the six areas of the real sheet and the team fund (id 1); the rest is empty. */
export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    lookups: {
      categories,
      priorities: ["High", "Medium", "Low"],
      vatRates: [0, 11, 22],
      vatRules,
      settings,
    },
    areas: ["MT + DMT", "SW", "HW", "CM", "MGT", "RT"].map((name, index) => ({
      id: index + 1,
      code: name.toLowerCase().replace(/\W+/g, "-").replace(/-$/, ""),
      name,
      position: index + 1,
    })),
    projects: [],
    lines: [],
    funds: [
      { id: 1, name: "Team's fund", kind: "team", paysVat: { estimate: false, actual: false } },
    ],
    contracts: [],
    inflows: [],
    suppliers: [],
    bank: null,
    ...overrides,
  };
}
