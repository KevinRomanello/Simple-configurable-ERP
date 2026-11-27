import {
  bom, costContext, costSeries, makePlan, maxMakeable, monthEnds, onHandMilli, placesOf, receiptsOf, stockRows, takeFromShelf, unitCost,
  type Bom, type CostPoint, type InventoryData, type MakePlan, type PartInput, type PlanLine, type StockRow, type Take,
} from "@erp/calc";
import { and, eq, sql } from "drizzle-orm";
import { conflict, invalid, notFound } from "../../core/errors";
import { fromScaled, toScaled } from "../../core/money";
import { today } from "../../core/today";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { componentPart, inventoryItem } from "../../db/schema/inventory";
import { area } from "../../db/schema/platform";
import { loadInventory, partInput } from "./inventory.data";
import type { ComponentsQuery, PriceQuery } from "./inventory.schema";
import { assertCanManageInventory, makeProjectsOf, withMakeProject } from "./items.service";
import { subtreeIds } from "./types.service";

/** Whether going down the bills of materials from `from` reaches `target`. */
export function reaches(parts: PartInput[], from: number, target: number, seen = new Set<number>()): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return parts.filter((p) => p.componentId === from).some((p) => reaches(parts, p.partId, target, seen));
}

/** Every item that goes into `componentId`, directly or through the parts of its parts. */
function closure(parts: PartInput[], componentId: number): Set<number> {
  const found = new Set<number>([componentId]);
  const queue = [componentId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const p of parts.filter((x) => x.componentId === current)) {
      if (!found.has(p.partId)) {
        found.add(p.partId);
        queue.push(p.partId);
      }
    }
  }
  return found;
}

/** What is on the shelf of each item, in every place; for an item in `sources`, only in the place named. */
function availableFor(stock: StockRow[], sources: Map<number, string> = new Map()): Map<number, number> {
  const available = new Map<number, number>();
  for (const row of stock) {
    const only = sources.get(row.itemId);
    if (row.quantityMilli > 0 && (only === undefined || row.location === only)) available.set(row.itemId, (available.get(row.itemId) ?? 0) + row.quantityMilli);
  }
  return available;
}

export interface ComponentRow {
  id: number;
  name: string;
  unit: string;
  partsCount: number;
  unitE4: number | null;
  complete: boolean;
  onHandMilli: number;
  /** How many can be made with what is on the shelf of every place (to the thousandth); the sub-assemblies short are counted as made from their parts. */
  canMakeMilli: number;
  /** The parts that stop the next piece, the one missing most first (none when nothing stops it, or it has no parts). */
  limitedBy: string[];
}

/**
 * The things the team makes, with what one costs on the day asked for, and how many can be made now. Found by name (or
 * code, or what it is for), by area, by type (the types under it count too) and by the project they are usually made for.
 */
export async function listComponents(query: ComponentsQuery): Promise<ComponentRow[]> {
  const data = await loadInventory();
  const rows = new Map((await db.select().from(inventoryItem).where(eq(inventoryItem.origin, "made"))).map((r) => [r.id, r]));
  const makeProjects = query.project === undefined ? null : await makeProjectsOf(db);
  const needle = query.search?.toLowerCase();
  const ofTypes = query.type ? new Set(await subtreeIds(db, query.type)) : null;
  // an unknown area code finds nothing
  const areaId = query.area ? ((await db.select({ id: area.id }).from(area).where(eq(area.code, query.area)))[0]?.id ?? 0) : null;
  const ctx = costContext(data, query.basis);
  const stock = stockRows(data.movements);
  const available = availableFor(stock);
  const names = new Map(data.items.map((i) => [i.id, i.name]));
  return data.items
    .filter((i) => i.origin === "made")
    .filter((i) => {
      const r = rows.get(i.id);
      if (!r) return false;
      if (areaId !== null && r.areaId !== areaId) return false;
      if (ofTypes && (r.typeId === null || !ofTypes.has(r.typeId))) return false;
      if (makeProjects && makeProjects.get(r.id) !== query.project) return false;
      return needle ? [r.name, r.brand, r.model, r.code, r.purpose].some((v) => v?.toLowerCase().includes(needle)) : true;
    })
    .map((i) => {
      const cost = unitCost(i.id, ctx, query.method, query.on ?? today());
      const most = maxMakeable(i.id, data, available);
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        partsCount: data.parts.filter((p) => p.componentId === i.id).length,
        unitE4: cost.unitE4,
        complete: cost.complete,
        onHandMilli: onHandMilli(stock, i.id),
        canMakeMilli: most.maxMilli,
        limitedBy: most.limitedBy.map((id) => names.get(id) ?? `#${id}`),
      };
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export interface PlanLineView extends PlanLine {
  /** Where it would be taken from, spot by spot. */
  takes: Take[];
  /** Every place that holds some, the one with the most first: what the choice of where to take it from offers. */
  places: { location: string; quantityMilli: number }[];
  /** The only place it is taken from, when it was asked; null: wherever it is. */
  takeFrom: string | null;
}

export interface PlanView extends Omit<MakePlan, "lines"> {
  lines: PlanLineView[];
  unit: string;
  /** The most that can be made now (with the choices of the places made), and what stops one thousandth more. */
  maxMilli: number;
  limitedBy: { partId: number; name: string }[];
}

/**
 * What it takes to make `quantity` of a component against the shelf, part by part and where each is taken from: every
 * place, the one with the most first, or the place `from` names for a part (part id -> code). The preview of «Make new»:
 * the build takes exactly this.
 */
export async function getPlan(componentId: number, query: { quantity: string; from: Record<string, string> }): Promise<PlanView> {
  const [item] = await db.select().from(inventoryItem).where(eq(inventoryItem.id, componentId));
  if (!item) throw notFound("Item");
  if (item.origin !== "made") throw invalid(`"${item.name}" is not something the team makes`);
  const quantityMilli = toScaled(query.quantity, 3);
  if (quantityMilli <= 0) throw invalid("The quantity must be above zero");

  const data = await loadInventory();
  const stock = stockRows(data.movements);
  const sources = new Map(Object.entries(query.from).map(([partId, code]) => [Number(partId), code]));
  const available = availableFor(stock, sources);
  const plan = makePlan(componentId, quantityMilli, data, available);
  const most = maxMakeable(componentId, data, available);
  const names = new Map(data.items.map((i) => [i.id, i.name]));
  const lines = plan.lines.map((line): PlanLineView => {
    const rows = stock.filter((r) => r.itemId === line.partId);
    // what the shelf gives: all of it unless some is missing, or a sub-assembly is to be made first for the rest
    const taken = line.neededMilli - line.missingMilli - line.makeFirstMilli;
    const only = sources.get(line.partId);
    return { ...line, takes: takeFromShelf(rows, taken, only).takes, places: placesOf(rows), takeFrom: only ?? null };
  });
  return {
    ...plan,
    lines,
    // nothing to make it from is nothing that can be made
    enough: plan.enough && plan.lines.length > 0,
    unit: item.unit,
    maxMilli: most.maxMilli,
    limitedBy: most.limitedBy.map((partId) => ({ partId, name: names.get(partId) ?? `#${partId}` })),
  };
}

export interface ComponentDetail {
  item: typeof inventoryItem.$inferSelect & { makeProjectId: number | null };
  bom: Bom;
  /** The cost at the end of each month, from the first purchase of any of its materials. */
  series: CostPoint[];
  /** The note written next to each part, by part id. */
  notes: Record<number, string>;
  /** What is on the shelf of each part (all the places), by part id, in thousandths. */
  available: Record<number, number>;
  /** How many can be made with what is on the shelf, and the parts that stop the next one (see the list). */
  canMakeMilli: number;
  limitedBy: string[];
}

export async function getComponent(componentId: number, query: PriceQuery): Promise<ComponentDetail> {
  const [item] = await db.select().from(inventoryItem).where(eq(inventoryItem.id, componentId));
  if (!item) throw notFound("Item");
  if (item.origin !== "made") throw invalid(`"${item.name}" is not something the team makes`);

  const data = await loadInventory();
  const ctx = costContext(data, query.basis);
  const on = query.on ?? today();
  const inside = closure(data.parts, componentId);
  const firstPurchase = [...inside]
    .flatMap((id) => receiptsOf(data.movements, id, query.basis).map((r) => r.on))
    .sort()[0];
  const days = firstPurchase && firstPurchase <= on ? monthEnds(firstPurchase, on).slice(-60) : [];

  const rows = await db.select().from(componentPart).where(eq(componentPart.componentId, componentId));
  const notes = Object.fromEntries(rows.filter((r) => r.note).map((r) => [r.partId, r.note!]));

  const shelf = availableFor(stockRows(data.movements));
  const available = Object.fromEntries(rows.map((r) => [r.partId, shelf.get(r.partId) ?? 0]));
  const most = maxMakeable(componentId, data, shelf);
  const names = new Map(data.items.map((i) => [i.id, i.name]));
  return {
    item: await withMakeProject(db, item), bom: bom(componentId, ctx, query.method, on), series: costSeries(componentId, ctx, query.method, days), notes, available,
    canMakeMilli: most.maxMilli,
    limitedBy: most.limitedBy.map((id) => names.get(id) ?? `#${id}`),
  };
}

// --- editing the bill of materials ----------------------------------------------------------------

/** Any edit that adds a part waits for the one before it: otherwise A-in-B and B-in-A could both pass the check. */
const BILL_OF_MATERIALS_LOCK = 4_040_001;

async function lockComponent(tx: Parameters<Parameters<typeof runWrite>[1]>[0], componentId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${BILL_OF_MATERIALS_LOCK})`);
  const [component] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, componentId));
  if (!component) throw notFound("Item");
  if (component.origin !== "made") throw invalid(`"${component.name}" is not something the team makes: only made items have parts`);
  return component;
}

export async function addPart(componentId: number, input: { partId: number; quantity: string; note: string | null }) {
  const actor = await assertCanManageInventory();
  const quantityMilli = toScaled(input.quantity, 3);
  if (quantityMilli <= 0) throw invalid("The quantity must be above zero");
  return runWrite(actor, async (tx) => {
    const component = await lockComponent(tx, componentId);
    const [part] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, input.partId));
    if (!part) throw notFound("Part");
    if (part.id === component.id) throw invalid("An item cannot be a part of itself");

    const parts = (await tx.select().from(componentPart)).map(partInput);
    if (parts.some((p) => p.componentId === componentId && p.partId === part.id)) {
      throw conflict(`"${part.name}" is already in the list: change its quantity instead`);
    }
    if (reaches(parts, part.id, componentId)) {
      throw conflict(`"${part.name}" is made with "${component.name}": it cannot also be a part of it`);
    }
    const [created] = await tx
      .insert(componentPart)
      .values({ componentId, partId: part.id, quantity: fromScaled(quantityMilli, 3), note: input.note })
      .returning();
    return created!;
  });
}

export async function updatePart(componentId: number, partId: number, input: { quantity?: string; note?: string | null }) {
  const actor = await assertCanManageInventory();
  const changes: Partial<typeof componentPart.$inferInsert> = {};
  if (input.quantity !== undefined) {
    const milli = toScaled(input.quantity, 3);
    if (milli <= 0) throw invalid("The quantity must be above zero");
    changes.quantity = fromScaled(milli, 3);
  }
  if (input.note !== undefined) changes.note = input.note;
  return runWrite(actor, async (tx) => {
    const [updated] = await tx
      .update(componentPart)
      .set(changes)
      .where(and(eq(componentPart.componentId, componentId), eq(componentPart.partId, partId)))
      .returning();
    if (!updated) throw notFound("Part");
    return updated;
  });
}

export async function removePart(componentId: number, partId: number) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const deleted = await tx
      .delete(componentPart)
      .where(and(eq(componentPart.componentId, componentId), eq(componentPart.partId, partId)))
      .returning({ id: componentPart.id });
    if (deleted.length === 0) throw notFound("Part");
  });
}

export type { InventoryData };
