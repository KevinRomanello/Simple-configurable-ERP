import type { InventoryData, ItemInput, MovementInput, PartInput } from "@erp/calc";
import { eq } from "drizzle-orm";
import { contracts, type Db } from "../../core/contracts";
import { toScaled } from "../../core/money";
import { anyOf } from "../../core/sql";
import type { Tx } from "../../core/tx";
import { db } from "../../db/client";
import { currentActive } from "../../platform/platform.public";
import { movementTies, type MovementTie } from "./inventory.ports";
import { componentPart, inventoryItem, stockMovement } from "../../db/schema/inventory";

type Reader = Db;

/** The name, brand and model written the way a person reads them: «Bearing · SKF · 6204». */
export const itemLabel = (item: { name: string; brand: string | null; model: string | null }) => [item.name, item.brand, item.model].filter(Boolean).join(" · ");

/**
 * An item as the calculation engine reads it. Its `name` is the whole label: the engine only shows it (the lines of a bill of
 * materials, what a build is short of), and two items with the same name must not look alike there.
 */
export function itemInput(row: typeof inventoryItem.$inferSelect): ItemInput {
  return { id: row.id, name: itemLabel(row), category: row.category, origin: row.origin, unit: row.unit };
}

/** What a movement is tied to on the budget's side: the project it was for and the purchase it completes. */
type Ties = Pick<MovementTie, "projectId" | "lineId">;
const NO_TIES: Ties = { projectId: null, lineId: null };

/** The ties of every movement that has one, by movement, from whoever keeps them (the bridge to the budget; none without it). */
async function tiesByMovement(reader: Db): Promise<Map<number, Ties>> {
  return new Map((await contracts.ask(movementTies, currentActive(), reader, {})).map((t) => [t.movementId, t]));
}

/** The database row of a movement as the calculation engine reads it (thousandths, ten-thousandths), with what it is tied to. */
export function movementInput(row: typeof stockMovement.$inferSelect, ties: Ties = NO_TIES): MovementInput {
  const price = (value: string | null) => (value === null ? null : toScaled(value, 4));
  return {
    id: row.id,
    itemId: row.itemId,
    kind: row.kind,
    on: row.occurredOn,
    quantityMilli: toScaled(row.quantity, 3),
    location: row.location,
    spot: row.spot,
    toLocation: row.toLocation,
    toSpot: row.toSpot,
    unitNetE4: price(row.unitNet),
    unitGrossE4: price(row.unitGross),
    unitTeamE4: price(row.unitTeam),
    projectId: ties.projectId,
    lineId: ties.lineId,
  };
}

export function partInput(row: typeof componentPart.$inferSelect): PartInput {
  return { componentId: row.componentId, partId: row.partId, quantityMilli: toScaled(row.quantity, 3) };
}

/** Every item, movement and bill of materials: what the inventory calculations start from. */
export async function loadInventory(reader: Reader = db): Promise<InventoryData> {
  const [items, movements, parts, ties] = await Promise.all([
    reader.select().from(inventoryItem),
    reader.select().from(stockMovement),
    reader.select().from(componentPart),
    tiesByMovement(reader),
  ]);
  return { items: items.map(itemInput), movements: movements.map((m) => movementInput(m, ties.get(m.id))), parts: parts.map(partInput) };
}

/** The movements of one item, read inside a write after the item has been locked. */
export async function movementsOf(tx: Tx, itemId: number): Promise<MovementInput[]> {
  // what the stock of a place is does not depend on the project or the purchase: they are left out
  return (await tx.select().from(stockMovement).where(eq(stockMovement.itemId, itemId))).map((m) => movementInput(m));
}

// --- what the bridge to the budget reads of the inventory (inventory.public.ts) ------------------------

/** A movement of the shelf as a plain fact. */
export interface MovementFact {
  id: number;
  itemId: number;
  kind: string;
  on: string;
  quantityMilli: number;
}

/** The movements with these ids (the ones that exist). */
export async function movementsByIds(reader: Db, ids: number[]): Promise<MovementFact[]> {
  if (ids.length === 0) return [];
  const rows = await reader
    .select({ id: stockMovement.id, itemId: stockMovement.itemId, kind: stockMovement.kind, on: stockMovement.occurredOn, quantity: stockMovement.quantity })
    .from(stockMovement)
    .where(anyOf(stockMovement.id, ids));
  return rows.map((r) => ({ id: r.id, itemId: r.itemId, kind: r.kind, on: r.on, quantityMilli: toScaled(r.quantity, 3) }));
}

/** Every item's name, brand and model: what an arrival of a purchase is matched to. */
export async function itemIdentities(reader: Db): Promise<{ id: number; name: string; brand: string | null; model: string | null }[]> {
  return reader.select({ id: inventoryItem.id, name: inventoryItem.name, brand: inventoryItem.brand, model: inventoryItem.model }).from(inventoryItem);
}
