import {
  bom, costContext, costSeries, monthEnds, onHandMilli, receiptsOf, stockRows, unitCost,
  type Bom, type CostPoint, type InventoryData, type PartInput,
} from "@erp/calc";
import { and, eq, sql } from "drizzle-orm";
import { conflict, invalid, notFound } from "../../core/errors";
import { fromScaled, toScaled } from "../../core/money";
import { today } from "../../core/today";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { componentPart, inventoryItem } from "../../db/schema";
import { loadInventory, partInput } from "./inventory.data";
import type { PriceQuery } from "./inventory.schema";
import { assertCanManageInventory } from "./items.service";

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

export interface ComponentRow {
  id: number;
  name: string;
  unit: string;
  partsCount: number;
  unitE4: number | null;
  complete: boolean;
  onHandMilli: number;
}

/** The things the team makes, with what one costs on the day asked for. */
export async function listComponents(query: PriceQuery): Promise<ComponentRow[]> {
  const data = await loadInventory();
  const ctx = costContext(data, query.basis);
  const stock = stockRows(data.movements);
  return data.items
    .filter((i) => i.origin === "made")
    .map((i) => {
      const cost = unitCost(i.id, ctx, query.method, query.on ?? today());
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        partsCount: data.parts.filter((p) => p.componentId === i.id).length,
        unitE4: cost.unitE4,
        complete: cost.complete,
        onHandMilli: onHandMilli(stock, i.id),
      };
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export interface ComponentDetail {
  item: typeof inventoryItem.$inferSelect;
  bom: Bom;
  /** The cost at the end of each month, from the first purchase of any of its materials. */
  series: CostPoint[];
  /** The note written next to each part, by part id. */
  notes: Record<number, string>;
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

  return { item, bom: bom(componentId, ctx, query.method, on), series: costSeries(componentId, ctx, query.method, days), notes };
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
