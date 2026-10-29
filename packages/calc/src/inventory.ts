import { daysBetween } from "./dates";
import type { CalcLine } from "./lines";
import { linePricesE4, type UnitPricesE4 } from "./arrival";

// The inventory, as pure functions. What is on the shelf is never stored as a number: it is the
// sum of a register of movements (receipts, uses, transfers, counts, disposals). Prices are the
// ones frozen on each receipt, so what a thing cost, and what it costs now, can be told for any
// day. Rules: docs/inventario.md.
//
// Units, like in the budget: quantities in thousandths, unit prices in ten-thousandths of a
// euro (E4), money in cents. Sums of quantity x price go through BigInt: they can go beyond
// what a JavaScript number holds exactly.

// "build" is a made item coming off the line: it adds pieces to the shelf and freezes their cost, while
// the parts it took leave the shelf as ordinary "use" movements.
export const MOVEMENT_KINDS = ["receipt", "use", "transfer", "adjustment", "disposal", "build"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** Which price of a receipt is meant: before VAT, with VAT, or what the team actually pays. */
export const PRICE_BASES = ["net", "gross", "team"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

/** The price of an item on a day: the latest receipt, or the average of the receipts so far. */
export const PRICE_METHODS = ["last", "average"] as const;
export type PriceMethod = (typeof PRICE_METHODS)[number];

export type ItemOrigin = "bought" | "made";

export interface ItemInput {
  id: number;
  name: string;
  category: string | null;
  origin: ItemOrigin;
  unit: string;
}

export interface MovementInput {
  id: number;
  itemId: number;
  kind: MovementKind;
  /** The day it happened, YYYY-MM-DD. */
  on: string;
  /** Always positive, except for a count ("adjustment"), which is signed. */
  quantityMilli: number;
  location: string;
  spot: string;
  /** Transfers only: where it goes. */
  toLocation: string | null;
  toSpot: string | null;
  /** Receipts only: the three prices, frozen. */
  unitNetE4: number | null;
  unitGrossE4: number | null;
  unitTeamE4: number | null;
  projectId: number | null;
  lineId: number | null;
}

/** `partId`, `quantityMilli` units of it, go into one unit of `componentId`. */
export interface PartInput {
  componentId: number;
  partId: number;
  quantityMilli: number;
}

export interface InventoryData {
  items: ItemInput[];
  movements: MovementInput[];
  parts: PartInput[];
}

/** Integer division rounded half away from zero, exact for any size. */
function roundDivBig(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const quotient = (2n * (negative ? -numerator : numerator) + denominator) / (2n * denominator);
  return negative ? -quotient : quotient;
}

/** quantity x unit price in cents (thousandths x ten-thousandths / 100 000), exact. */
export function valueCents(quantityMilli: number, unitE4: number): number {
  return Number(roundDivBig(BigInt(quantityMilli) * BigInt(unitE4), 100_000n));
}

/**
 * Rows grouped by item, in one pass. Reading one item from this is instant; filtering every
 * movement for each item would cost items x movements.
 */
export function byItem<T extends { itemId: number }>(rows: T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const group = groups.get(row.itemId);
    if (group) group.push(row);
    else groups.set(row.itemId, [row]);
  }
  return groups;
}

// --- what is on the shelf -------------------------------------------------------------------------

export interface StockRow {
  itemId: number;
  location: string;
  spot: string;
  quantityMilli: number;
}

/** How much of each item is where. Rows at zero are left out; a negative one means bad data. */
export function stockRows(movements: MovementInput[]): StockRow[] {
  const rows = new Map<string, StockRow>();
  const add = (itemId: number, location: string, spot: string, quantityMilli: number) => {
    const key = `${itemId}\u0000${location}\u0000${spot}`;
    const row = rows.get(key) ?? { itemId, location, spot, quantityMilli: 0 };
    row.quantityMilli += quantityMilli;
    rows.set(key, row);
  };
  for (const m of movements) {
    switch (m.kind) {
      case "receipt":
      case "build":
      case "adjustment":
        add(m.itemId, m.location, m.spot, m.quantityMilli);
        break;
      case "use":
      case "disposal":
        add(m.itemId, m.location, m.spot, -m.quantityMilli);
        break;
      case "transfer":
        add(m.itemId, m.location, m.spot, -m.quantityMilli);
        add(m.itemId, m.toLocation ?? m.location, m.toSpot ?? "", m.quantityMilli);
        break;
    }
  }
  return [...rows.values()]
    .filter((row) => row.quantityMilli !== 0)
    .sort((a, b) => a.itemId - b.itemId || a.location.localeCompare(b.location) || a.spot.localeCompare(b.spot));
}

export function onHandMilli(rows: StockRow[], itemId: number): number {
  return rows.filter((r) => r.itemId === itemId).reduce((sum, r) => sum + r.quantityMilli, 0);
}

/** How much came in through receipts, whatever has happened to it since ("quantity bought"). */
export function receivedMilli(movements: MovementInput[], itemId: number): number {
  return movements.filter((m) => m.itemId === itemId && m.kind === "receipt").reduce((sum, m) => sum + m.quantityMilli, 0);
}

// --- prices ---------------------------------------------------------------------------------------

export interface Receipt {
  id: number;
  on: string;
  quantityMilli: number;
  unitE4: number;
}

function priceOf(m: MovementInput, basis: PriceBasis): number {
  const price = basis === "net" ? m.unitNetE4 : basis === "gross" ? m.unitGrossE4 : m.unitTeamE4;
  return price ?? 0;
}

/**
 * The arrivals of an item with the chosen price, oldest first: what was bought and what the team
 * built, both with the price frozen on the day (the name says "receipts" for what comes from outside).
 */
export function receiptsOf(movements: MovementInput[], itemId: number, basis: PriceBasis): Receipt[] {
  return movements
    .filter((m) => m.itemId === itemId && (m.kind === "receipt" || m.kind === "build"))
    .map((m) => ({ id: m.id, on: m.on, quantityMilli: m.quantityMilli, unitE4: priceOf(m, basis) }))
    .sort((a, b) => a.on.localeCompare(b.on) || a.id - b.id);
}

/**
 * What one unit costs on day `on`, from the receipts up to that day: the latest price, or the
 * average of all of them weighted by quantity. Null when nothing had been bought yet.
 */
export function unitPriceE4(receipts: Receipt[], method: PriceMethod, on: string): number | null {
  const sofar = receipts.filter((r) => r.on <= on);
  const last = sofar.at(-1);
  if (!last) return null;
  if (method === "last") return last.unitE4;
  let value = 0n;
  let quantity = 0n;
  for (const r of sofar) {
    value += BigInt(r.quantityMilli) * BigInt(r.unitE4);
    quantity += BigInt(r.quantityMilli);
  }
  return Number(roundDivBig(value, quantity));
}

export interface PricePoint {
  on: string;
  quantityMilli: number;
  unitE4: number;
}

/** Every purchase of an item with its price: the history behind the chart. */
export function priceHistory(movements: MovementInput[], itemId: number, basis: PriceBasis): PricePoint[] {
  return receiptsOf(movements, itemId, basis).map((r) => ({ on: r.on, quantityMilli: r.quantityMilli, unitE4: r.unitE4 }));
}

// --- what things we make cost ---------------------------------------------------------------------

export interface CostContext {
  items: Map<number, ItemInput>;
  parts: Map<number, PartInput[]>;
  receipts: Map<number, Receipt[]>;
}

export function costContext(data: InventoryData, basis: PriceBasis): CostContext {
  const parts = new Map<number, PartInput[]>();
  for (const part of data.parts) parts.set(part.componentId, [...(parts.get(part.componentId) ?? []), part]);
  const moved = byItem(data.movements);
  const receipts = new Map<number, Receipt[]>();
  for (const item of data.items) receipts.set(item.id, receiptsOf(moved.get(item.id) ?? [], item.id, basis));
  return { items: new Map(data.items.map((i) => [i.id, i])), parts, receipts };
}

export interface UnitCost {
  unitE4: number | null;
  /** False when some material has never been bought, so the cost is missing something. */
  complete: boolean;
}

/**
 * What one unit of an item costs on day `on`. A bought item costs what its receipts say; an item
 * with a bill of materials costs the sum of its parts (which may be made things themselves).
 * A bill of materials that contains itself is an error: the API refuses to create one.
 */
export function unitCost(itemId: number, ctx: CostContext, method: PriceMethod, on: string, visiting = new Set<number>()): UnitCost {
  const parts = ctx.parts.get(itemId) ?? [];
  if (parts.length === 0) {
    const price = unitPriceE4(ctx.receipts.get(itemId) ?? [], method, on);
    return { unitE4: price, complete: price !== null };
  }
  if (visiting.has(itemId)) throw new Error(`The bill of materials of item ${itemId} contains itself`);
  visiting.add(itemId);
  let sum = 0n;
  let known = false;
  let complete = true;
  for (const part of parts) {
    const cost = unitCost(part.partId, ctx, method, on, visiting);
    if (cost.unitE4 === null) {
      complete = false;
      continue;
    }
    known = true;
    sum += BigInt(part.quantityMilli) * BigInt(cost.unitE4);
    if (!cost.complete) complete = false;
  }
  visiting.delete(itemId);
  // quantity in thousandths x price in E4 / 1000 = price in E4
  return known ? { unitE4: Number(roundDivBig(sum, 1000n)), complete } : { unitE4: null, complete: false };
}

/**
 * What one unit on the shelf is worth on day `on`: what it was paid, or built for, by the arrivals
 * up to that day (the latest, or the average weighted by quantity). A made item that has never been
 * built or received is worth what it would cost to make now, so that it is not shown as worthless.
 * A piece already built keeps its cost when the price of a part goes up: only the next ones use it.
 */
export function shelfPrice(itemId: number, ctx: CostContext, method: PriceMethod, on: string): UnitCost {
  const price = unitPriceE4(ctx.receipts.get(itemId) ?? [], method, on);
  return price !== null ? { unitE4: price, complete: true } : unitCost(itemId, ctx, method, on);
}

/** How many of each part a build of `quantityMilli` units takes: quantity in one x pieces, to the thousandth. */
export function buildNeeds(parts: PartInput[], quantityMilli: number): { partId: number; quantityMilli: number }[] {
  return parts
    .map((part) => ({ partId: part.partId, quantityMilli: Number(roundDivBig(BigInt(part.quantityMilli) * BigInt(quantityMilli), 1000n)) }))
    .filter((need) => need.quantityMilli > 0);
}

/**
 * What one unit of a made item costs when it is built on day `on`, in the three prices a build
 * freezes: the parts as they are worth on the shelf that day (`shelfPrice`). `unpriced` lists the
 * parts that have no price at all, so that the build can be refused rather than frozen too low.
 */
export function builtPricesE4(
  componentId: number,
  contexts: Record<PriceBasis, CostContext>,
  method: PriceMethod,
  on: string,
): { prices: UnitPricesE4; unpriced: number[] } {
  const unpriced = new Set<number>();
  const priceOf = (basis: PriceBasis) => {
    let sum = 0n;
    for (const part of contexts[basis].parts.get(componentId) ?? []) {
      const price = shelfPrice(part.partId, contexts[basis], method, on);
      if (price.unitE4 === null) unpriced.add(part.partId);
      else sum += BigInt(part.quantityMilli) * BigInt(price.unitE4);
    }
    return Number(roundDivBig(sum, 1000n));
  };
  const prices = { net: priceOf("net"), gross: priceOf("gross"), team: priceOf("team") };
  return { prices, unpriced: [...unpriced] };
}

export interface BomLine {
  partId: number;
  name: string;
  unit: string;
  origin: ItemOrigin;
  quantityMilli: number;
  unitE4: number | null;
  /** quantity x unit price, rounded to the cent; null when the part has never been bought. */
  totalCents: number | null;
  complete: boolean;
}

export interface Bom {
  lines: BomLine[];
  /** What one unit costs, exact (this is what a larger assembly uses). */
  unitE4: number | null;
  /** The sum of the lines as shown, so that what is on the screen adds up. */
  totalCents: number | null;
  complete: boolean;
}

/** The bill of materials of a component, priced on day `on`. */
export function bom(componentId: number, ctx: CostContext, method: PriceMethod, on: string): Bom {
  const lines = (ctx.parts.get(componentId) ?? []).map((part): BomLine => {
    const item = ctx.items.get(part.partId);
    const cost = unitCost(part.partId, ctx, method, on, new Set([componentId]));
    return {
      partId: part.partId,
      name: item?.name ?? `#${part.partId}`,
      unit: item?.unit ?? "pcs",
      origin: item?.origin ?? "bought",
      quantityMilli: part.quantityMilli,
      unitE4: cost.unitE4,
      totalCents: cost.unitE4 === null ? null : valueCents(part.quantityMilli, cost.unitE4),
      complete: cost.complete,
    };
  });
  const total = unitCost(componentId, ctx, method, on);
  const priced = lines.filter((l) => l.totalCents !== null);
  return {
    lines,
    unitE4: total.unitE4,
    totalCents: priced.length === 0 ? null : priced.reduce((sum, l) => sum + (l.totalCents ?? 0), 0),
    complete: total.complete,
  };
}

/** What one part of a made item cost on a day: the quantity that goes into one piece and its unit price. */
export interface PartPrice {
  partId: number;
  name: string;
  quantityMilli: number;
  unitE4: number | null;
}

export interface CostPoint {
  on: string;
  unitE4: number | null;
  complete: boolean;
  /** The prices of the parts that day, so that a rise of the cost can be traced to the part that got dearer. */
  parts: PartPrice[];
}

/** What a component would have cost on each of the given days: the cost over time, with the price of each part. */
export function costSeries(componentId: number, ctx: CostContext, method: PriceMethod, days: string[]): CostPoint[] {
  const parts = ctx.parts.get(componentId) ?? [];
  return days.map((on) => ({
    on,
    ...unitCost(componentId, ctx, method, on),
    parts: parts.map((part) => ({
      partId: part.partId,
      name: ctx.items.get(part.partId)?.name ?? `#${part.partId}`,
      quantityMilli: part.quantityMilli,
      unitE4: unitCost(part.partId, ctx, method, on, new Set([componentId])).unitE4,
    })),
  }));
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysIn(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1]!;
}

/** The last day of each month from the month of `from` to the month of `to`; the last one is `to` itself. */
export function monthEnds(from: string, to: string): string[] {
  const days: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const lastYear = Number(to.slice(0, 4));
  const lastMonth = Number(to.slice(5, 7));
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const end = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(daysIn(year, month)).padStart(2, "0")}`;
    days.push(end < to ? end : to);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return days;
}

// --- purchases waiting for their goods -----------------------------------------------------------

export interface PendingLine {
  lineId: number;
  item: string;
  category: string | null;
  projectId: number;
  projectName: string;
  areaId: number;
  areaCode: string;
  areaName: string;
  supplierName: string | null;
  status: "ordered" | "partial";
  boughtMilli: number;
  receivedMilli: number;
  remainingMilli: number;
  purchaseDate: string | null;
  /** What was typed in the budget: the actual arrival date if any, else the expected one. */
  expectedArrival: string | null;
  /** Days since the purchase date, or null without one. */
  daysWaiting: number | null;
  prices: UnitPricesE4;
}

/** The lines of the budget that were bought and have not fully arrived, the oldest purchase first. */
export function pendingLines(lines: CalcLine[], today: string): PendingLine[] {
  const pending: PendingLine[] = [];
  for (const line of lines) {
    const { status, boughtMilli, receivedMilli: received } = line.arrival;
    const prices = linePricesE4(line);
    if ((status !== "ordered" && status !== "partial") || !prices) continue;
    pending.push({
      lineId: line.id,
      item: line.item,
      category: line.category,
      projectId: line.projectId,
      projectName: line.projectName,
      areaId: line.areaId,
      areaCode: line.areaCode,
      areaName: line.areaName,
      supplierName: line.actual.supplierName,
      status,
      boughtMilli,
      receivedMilli: received,
      remainingMilli: boughtMilli - received,
      purchaseDate: line.actual.purchaseDate,
      expectedArrival: line.actual.arrivalDate ?? line.estimate.arrivalDate,
      daysWaiting: line.actual.purchaseDate ? daysBetween(line.actual.purchaseDate, today) : null,
      prices,
    });
  }
  return pending.sort((a, b) => (a.purchaseDate ?? "9999").localeCompare(b.purchaseDate ?? "9999") || a.lineId - b.lineId);
}

// --- statistics -----------------------------------------------------------------------------------

export type StatsDimension = "project" | "area" | "category" | "location";

export interface StatsRow {
  key: string;
  label: string;
  /** distinct items involved */
  items: number;
  /** goods received, at the price of each receipt */
  boughtCents: number;
  /** bought in the budget and not arrived yet, at the budget's price */
  pendingCents: number;
  /** taken from the shelf for a project, at the average price paid until then (pieces made by the team are not counted: their parts already were) */
  usedCents: number;
  /** what is on the shelf now, at the average price paid */
  stockCents: number;
}

export interface StatsContext {
  projects: { id: number; name: string; areaId: number }[];
  areas: { id: number; name: string }[];
}

const NO_PROJECT = { key: "none", label: "(no project)" };

/** Money by project, area, category or location: what was bought, is on its way, was used, is in stock. */
export function stats(
  dimension: StatsDimension,
  data: InventoryData,
  lines: CalcLine[],
  context: StatsContext,
  basis: PriceBasis,
  today: string,
): StatsRow[] {
  const items = new Map(data.items.map((i) => [i.id, i]));
  const projects = new Map(context.projects.map((p) => [p.id, p]));
  const areas = new Map(context.areas.map((a) => [a.id, a]));
  const moved = byItem(data.movements);
  const receipts = new Map(data.items.map((i) => [i.id, receiptsOf(moved.get(i.id) ?? [], i.id, basis)]));

  const rows = new Map<string, StatsRow & { involved: Set<number> }>();
  const row = (target: { key: string; label: string }) => {
    let found = rows.get(target.key);
    if (!found) {
      found = { ...target, items: 0, boughtCents: 0, pendingCents: 0, usedCents: 0, stockCents: 0, involved: new Set() };
      rows.set(target.key, found);
    }
    return found;
  };

  const projectKey = (projectId: number | null) => {
    const project = projectId === null ? undefined : projects.get(projectId);
    if (dimension === "project") return project ? { key: `project-${project.id}`, label: project.name } : NO_PROJECT;
    const area = project ? areas.get(project.areaId) : undefined; // dimension "area"
    return area ? { key: `area-${area.id}`, label: area.name } : NO_PROJECT;
  };
  const categoryKey = (category: string | null) => (category ? { key: category, label: category } : { key: "none", label: "(no category)" });
  const projectBased = dimension === "project" || dimension === "area";

  for (const m of data.movements) {
    const item = items.get(m.itemId);
    if (!item) continue;
    if (m.kind === "receipt" && dimension !== "location") {
      const target = projectBased ? projectKey(m.projectId) : categoryKey(item.category);
      const r = row(target);
      r.boughtCents += valueCents(m.quantityMilli, priceOf(m, basis));
      r.involved.add(item.id);
    }
    // A piece made by the team is not counted when it is used: the parts it is made of were already counted
    // as used when they were taken for the build (for the project the build was for).
    if (m.kind === "use" && dimension !== "location" && item.origin !== "made") {
      const target = projectBased ? projectKey(m.projectId) : categoryKey(item.category);
      const r = row(target);
      r.usedCents += valueCents(m.quantityMilli, unitPriceE4(receipts.get(item.id) ?? [], "average", m.on) ?? 0);
      r.involved.add(item.id);
    }
  }

  if (dimension !== "location") {
    for (const p of pendingLines(lines, today)) {
      const target = projectBased ? projectKey(p.projectId) : categoryKey(p.category);
      const r = row(target);
      r.pendingCents += valueCents(p.remainingMilli, p.prices[basis]);
    }
  }

  if (dimension === "category" || dimension === "location") {
    for (const s of stockRows(data.movements)) {
      const item = items.get(s.itemId);
      if (!item || s.quantityMilli <= 0) continue;
      const price = unitPriceE4(receipts.get(item.id) ?? [], "average", today) ?? 0;
      const target = dimension === "category" ? categoryKey(item.category) : { key: s.location, label: s.location };
      const r = row(target);
      r.stockCents += valueCents(s.quantityMilli, price);
      r.involved.add(item.id);
    }
  }

  return [...rows.values()]
    .map(({ involved, ...rest }) => ({ ...rest, items: involved.size }))
    .sort((a, b) => (a.key === "none" ? 1 : 0) - (b.key === "none" ? 1 : 0) || a.label.localeCompare(b.label));
}
