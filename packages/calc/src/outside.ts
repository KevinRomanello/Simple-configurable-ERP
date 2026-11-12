// What the team spends and receives outside the budget (a stamp duty, an insurance, a membership fee), calculated from the
// register as the rows of a derived area, so that it counts in TOTAL, the Gantt and the analyses like the rest.
// Pure, like the rest of the engine: money in cents, no I/O. docs/spese-fuori-budget.md

import type { AreaInput, LineInput, ProjectInput, ReceiptInput, RegisterIncome } from "./snapshot";
import { voceKey } from "./statement";

/** Where the money of a Voce counts: on a budget line (`project`), in the derived area (`outside`), or nowhere (`ignore`). */
export const CASH_SCOPES = ["project", "outside", "ignore"] as const;
export type CashScope = (typeof CASH_SCOPES)[number];

/** A movement of the register that counts outside the budget: its Voce says so and it is tied to no budget line (or inflow). */
export interface OutsideEntry {
  /** The day, YYYY-MM-DD. */
  on: string;
  /** The name of its Voce. */
  voce: string;
  /** Positive for money in, negative for money out. */
  cents: number;
}

export interface OutsideBudget {
  projects: ProjectInput[];
  lines: LineInput[];
  /** Each line is all there: nothing is pending in the inventory. */
  receipts: ReceiptInput[];
  /** The months where more money came in than went out on a Voce. */
  income: RegisterIncome[];
}

/** The section the Voci that no section holds go in. */
export const OTHER_SECTION = "Voci not in the statement";

interface Month {
  voce: string;
  month: string;
  /** What went out minus what came in: above zero it is a cost, below it money came in. */
  netCents: number;
  last: string;
  count: number;
}

/** The movements of each Voce, month by month. */
function byVoceAndMonth(entries: OutsideEntry[]): Month[] {
  const months = new Map<string, Month>();
  for (const entry of entries) {
    const month = entry.on.slice(0, 7);
    const key = `${voceKey(entry.voce)}|${month}`;
    const now = months.get(key) ?? { voce: entry.voce, month, netCents: 0, last: entry.on, count: 0 };
    months.set(key, { ...now, netCents: now.netCents - entry.cents, last: entry.on > now.last ? entry.on : now.last, count: now.count + 1 });
  }
  return [...months.values()];
}

/**
 * The derived area of a season, from the movements that count outside the budget. A Voce and a month are one line: ACTUAL
 * only, paid by no fund (the money is already out of the team's cash, so the forecast does not count it again), quantity
 * 1, no VAT, in the project of its section of the financial statement (`sections`, Voce -> section, in the order of the
 * statement). Months where money came in on a Voce are money in, not a line. Ids are negative: they are not rows of the
 * database, and nothing can be written to them.
 */
export function outsideBudget(entries: OutsideEntry[], sections: Map<string, string>, area: AreaInput, category: string): OutsideBudget {
  const order = [...new Set(sections.values()), OTHER_SECTION];
  const sectionOf = (voce: string) => sections.get(voceKey(voce)) ?? OTHER_SECTION;
  const months = byVoceAndMonth(entries);

  const costs = months
    .filter((m) => m.netCents > 0)
    .sort((a, b) => order.indexOf(sectionOf(a.voce)) - order.indexOf(sectionOf(b.voce)) || a.voce.localeCompare(b.voce) || a.month.localeCompare(b.month));

  const projects = order
    .filter((name) => costs.some((m) => sectionOf(m.voce) === name))
    .map((name): ProjectInput => ({ id: -(order.indexOf(name) + 1), areaId: area.id, name, ownerName: null, position: order.indexOf(name) + 1 }));

  const lines = costs.map((m, index): LineInput => {
    const projectId = -(order.indexOf(sectionOf(m.voce)) + 1);
    const actual = {
      quantityMilli: 1000,
      // cents to ten-thousandths of a euro
      unitCostE4: m.netCents * 100,
      unitGrossE4: null,
      sponsorType: "none" as const,
      sponsorValueCents: null,
      vatRate: 0,
      fundIds: [],
      supplierId: null,
      purchaseDate: m.last,
      arrivalDate: m.last,
    };
    return {
      id: -(index + 1),
      projectId,
      position: index + 1,
      item: `${m.voce} - ${m.month}`,
      category,
      priority: null,
      note: `${m.count} movement${m.count === 1 ? "" : "s"} in the register`,
      version: 0,
      carSeasonId: null,
      figures: { estimate: null, actual },
    };
  });

  const income = months.filter((m) => m.netCents < 0).map((m): RegisterIncome => ({ voce: m.voce, on: m.last, cents: -m.netCents }));
  return { projects, lines, receipts: lines.map((l) => ({ lineId: l.id, quantityMilli: 1000 })), income };
}
