import { buildNeeds, type InventoryData, type ItemOrigin, type StockRow } from "./inventory";

// What it takes to make some pieces of a made item, against what is on the shelf: the preview of «Make new»
// (docs/inventario.md, §21). Pure: the stock comes in as a number for each item. Quantities in thousandths, as
// everywhere in the inventory, so 2.2 m² of a part means 2200 and 2.199 is not enough.

/** How many pieces the search for the largest quantity looks at before it says "at least". */
const SEARCH_CEILING_MILLI = 1_000_000_000;

export interface PlanLine {
  partId: number;
  name: string;
  unit: string;
  origin: ItemOrigin;
  /** What the whole job asks of it: its own parts and those of the sub-assemblies that have to be made, added up. */
  neededMilli: number;
  /** What is on the shelf (in the place chosen, or in all of them). */
  availableMilli: number;
  /** What is left on the shelf after the job: never below zero. */
  leftMilli: number;
  /** A part that is not made from other parts: how much is short (0 when there is enough). */
  missingMilli: number;
  /** A made part: how many have to be made first, because the shelf has fewer than needed. Their own parts are in the lines. */
  makeFirstMilli: number;
}

export interface MakePlan {
  quantityMilli: number;
  lines: PlanLine[];
  /** Whether every part is there, the sub-assemblies that are short counting as made from their parts. */
  enough: boolean;
}

type Items = Pick<InventoryData, "items" | "parts">;

/** The parts of every made item, by item. */
function partsByComponent(data: Items) {
  const parts = new Map<number, Items["parts"]>();
  for (const part of data.parts) parts.set(part.componentId, [...(parts.get(part.componentId) ?? []), part]);
  return parts;
}

/**
 * What making `quantityMilli` of `componentId` takes, part by part. A part that is itself made is taken from the shelf
 * first; what the shelf cannot give is made from its own parts, and those are added to the same lines (a part used in two
 * places is counted once, so the shelf is not spent twice). `available`: milli on the shelf, by item.
 */
export function makePlan(componentId: number, quantityMilli: number, data: Items, available: Map<number, number>): MakePlan {
  const items = new Map(data.items.map((i) => [i.id, i]));
  const parts = partsByComponent(data);
  const needed = new Map<number, number>();
  const fromShelf = new Map<number, number>();
  const makeFirst = new Map<number, number>();
  const order: number[] = [];

  const demand = (id: number, quantity: number, path: Set<number>) => {
    for (const need of buildNeeds(parts.get(id) ?? [], quantity)) {
      if (!needed.has(need.partId)) order.push(need.partId);
      needed.set(need.partId, (needed.get(need.partId) ?? 0) + need.quantityMilli);
      const left = Math.max(0, (available.get(need.partId) ?? 0) - (fromShelf.get(need.partId) ?? 0));
      const takes = Math.min(left, need.quantityMilli);
      fromShelf.set(need.partId, (fromShelf.get(need.partId) ?? 0) + takes);
      const rest = need.quantityMilli - takes;
      const makeable = items.get(need.partId)?.origin === "made" && (parts.get(need.partId)?.length ?? 0) > 0 && !path.has(need.partId);
      if (rest > 0 && makeable) {
        makeFirst.set(need.partId, (makeFirst.get(need.partId) ?? 0) + rest);
        demand(need.partId, rest, new Set([...path, need.partId]));
      }
    }
  };
  demand(componentId, quantityMilli, new Set([componentId]));

  const lines = order.map((partId): PlanLine => {
    const item = items.get(partId);
    const total = needed.get(partId) ?? 0;
    const there = available.get(partId) ?? 0;
    const first = makeFirst.get(partId) ?? 0;
    return {
      partId,
      name: item?.name ?? `#${partId}`,
      unit: item?.unit ?? "pcs",
      origin: item?.origin ?? "bought",
      neededMilli: total,
      availableMilli: there,
      leftMilli: Math.max(0, there - total),
      missingMilli: first > 0 ? 0 : Math.max(0, total - there),
      makeFirstMilli: first,
    };
  });
  return { quantityMilli, lines, enough: lines.every((l) => l.missingMilli === 0) };
}

/** The most that can be made with what is on the shelf: to the thousandth, and the parts that stop the next thousandth. */
export function maxMakeable(componentId: number, data: Items, available: Map<number, number>): { maxMilli: number; limitedBy: number[] } {
  if ((data.parts.filter((p) => p.componentId === componentId).length) === 0) return { maxMilli: 0, limitedBy: [] };
  const enough = (milli: number) => makePlan(componentId, milli, data, available).enough;
  // double until it no longer fits, then narrow down between the last that did and the first that did not
  let low = 0;
  let high = 1000;
  while (enough(high)) {
    low = high;
    if (high >= SEARCH_CEILING_MILLI) return { maxMilli: SEARCH_CEILING_MILLI, limitedBy: [] };
    high *= 2;
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (enough(middle)) low = middle;
    else high = middle;
  }
  const blocked = makePlan(componentId, low + 1, data, available).lines.filter((l) => l.missingMilli > 0);
  return { maxMilli: low, limitedBy: blocked.sort((a, b) => b.missingMilli - a.missingMilli).map((l) => l.partId) };
}

// --- where the parts come from ------------------------------------------------------------------------

/** A part taken from one spot of one place. */
export interface Take {
  location: string;
  spot: string;
  quantityMilli: number;
}

type ShelfRow = Pick<StockRow, "location" | "spot" | "quantityMilli">;

/** The places that hold some of an item, the one with the most first (ties by code): the choices of «Take from». */
export function placesOf(rows: ShelfRow[]): { location: string; quantityMilli: number }[] {
  const total = new Map<string, number>();
  for (const row of rows) if (row.quantityMilli > 0) total.set(row.location, (total.get(row.location) ?? 0) + row.quantityMilli);
  return [...total].map(([location, quantityMilli]) => ({ location, quantityMilli })).sort((a, b) => b.quantityMilli - a.quantityMilli || a.location.localeCompare(b.location));
}

/**
 * Where `quantityMilli` of one item is taken from: only `place` when it is given, otherwise from every place, the one that
 * holds the most first (so that as few places as possible are touched); inside a place, spot after spot as the rows come.
 * The plan and the build both read the shelf this way, so what the preview says is what is taken.
 */
export function takeFromShelf(rows: ShelfRow[], quantityMilli: number, place?: string): { takes: Take[]; missingMilli: number } {
  const takes: Take[] = [];
  let left = quantityMilli;
  const order = place ? [place] : placesOf(rows).map((p) => p.location);
  for (const location of order) {
    for (const row of rows.filter((r) => r.location === location && r.quantityMilli > 0)) {
      if (left === 0) break;
      const take = Math.min(left, row.quantityMilli);
      takes.push({ location, spot: row.spot, quantityMilli: take });
      left -= take;
    }
  }
  return { takes, missingMilli: left };
}
