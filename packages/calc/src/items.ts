import { computeLines, type CalcLine, type PhaseCalc } from "./lines";
import type { Snapshot } from "./snapshot";
import { PRIORITIES, type Priority } from "./types";

export type PriorityFilter = "all" | Priority | "high-to-low" | "low-to-high";
export type ItemsSort = "estimate-date" | "actual-date" | "area-project";

export interface ItemsFilters {
  /** Empty means every category. */
  categories: string[];
  priority: PriorityFilter;
  sort: ItemsSort;
}

export interface ItemPhase {
  outflowCents: number;
  fundName: string | null;
  supplierName: string | null;
  purchaseDate: string | null;
}

export interface ItemRow {
  lineId: number;
  areaCode: string;
  areaName: string;
  projectName: string;
  item: string;
  category: string;
  priority: Priority | null;
  estimate: ItemPhase;
  actual: ItemPhase;
}

export interface ItemsView {
  /** True when sorted by area: the page shows a header row for each area. */
  groupedByArea: boolean;
  rows: ItemRow[];
}

const NO_DATE = "9999-99-99"; // sorts after every real date
const text = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

const phaseOf = (p: PhaseCalc): ItemPhase => ({
  outflowCents: p.amounts.outflowCents,
  fundName: p.fundName,
  supplierName: p.supplierName,
  purchaseDate: p.purchaseDate,
});

/**
 * CATEGORY ANALYSES: a read-only list of the items with category, priority and sort filters
 * (rules: docs/regole-script-attuale.md, section 13). As in the old sheet, an item without a
 * category never appears in this list.
 */
export function itemsView(snapshot: Snapshot, filters: ItemsFilters): ItemsView {
  const allowed =
    filters.categories.length > 0 ? filters.categories : snapshot.lookups.categories;
  const areaOrder = new Map(snapshot.areas.map((a, index) => [a.id, index]));

  const entries = computeLines(snapshot)
    .map((line, order) => ({ line, order }))
    .filter(({ line }) => line.category !== null && allowed.includes(line.category))
    .map(({ line, order }) => ({
      line,
      order,
      areaIndex: areaOrder.get(line.areaId) ?? 0,
      priority: (PRIORITIES as readonly string[]).includes(line.priority ?? "")
        ? (line.priority as Priority)
        : null,
    }))
    .filter(({ priority }) =>
      (PRIORITIES as readonly string[]).includes(filters.priority) ? priority === filters.priority : true,
    );

  const groupedByArea = filters.sort === "area-project";
  const sortsByPriority = filters.priority === "high-to-low" || filters.priority === "low-to-high";
  const rank = (p: Priority | null) => (p === null ? Infinity : PRIORITIES.indexOf(p));
  const dateOf = (line: CalcLine) =>
    (filters.sort === "actual-date" ? line.actual.purchaseDate : line.estimate.purchaseDate) ?? NO_DATE;

  type Entry = (typeof entries)[number];
  const byProject = (a: Entry, b: Entry) =>
    text(a.line.projectName, b.line.projectName) || a.order - b.order;

  entries.sort((a, b) => {
    if (groupedByArea && a.areaIndex !== b.areaIndex) return a.areaIndex - b.areaIndex;
    if (sortsByPriority) {
      const ar = rank(a.priority);
      const br = rank(b.priority);
      if (ar !== br) {
        if (ar === Infinity) return 1; // items without a priority always come last
        if (br === Infinity) return -1;
        return filters.priority === "high-to-low" ? ar - br : br - ar;
      }
    }
    if (groupedByArea) return byProject(a, b);
    const da = dateOf(a.line);
    const db = dateOf(b.line);
    if (da !== db) return da < db ? -1 : 1;
    return a.areaIndex - b.areaIndex || byProject(a, b);
  });

  return {
    groupedByArea,
    rows: entries.map(({ line, priority }) => ({
      lineId: line.id,
      areaCode: line.areaCode,
      areaName: line.areaName,
      projectName: line.projectName,
      item: line.item,
      category: line.category!,
      priority,
      estimate: phaseOf(line.estimate),
      actual: phaseOf(line.actual),
    })),
  };
}
