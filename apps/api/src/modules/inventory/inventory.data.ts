import type { InventoryData, ItemInput, MovementInput, PartInput } from "@erp/calc";
import { eq } from "drizzle-orm";
import { toScaled } from "../../core/money";
import type { Tx } from "../../core/tx";
import { db } from "../../db/client";
import { componentPart, inventoryItem, stockMovement } from "../../db/schema/inventory";
import { movementProject, receiptLine } from "../../db/schema/inventory-budget";

type Reader = Pick<typeof db, "select">;

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
export type MovementTies = { projectId: number | null; lineId: number | null };
const NO_TIES: MovementTies = { projectId: null, lineId: null };

/** The ties of every movement that has one, by movement (two small tables, read whole). */
export async function movementTies(reader: Reader): Promise<Map<number, MovementTies>> {
  const [projects, lines] = await Promise.all([
    reader.select({ movementId: movementProject.movementId, projectId: movementProject.projectId }).from(movementProject),
    reader.select({ movementId: receiptLine.movementId, lineId: receiptLine.lineId }).from(receiptLine),
  ]);
  const ties = new Map<number, MovementTies>();
  for (const p of projects) ties.set(p.movementId, { ...(ties.get(p.movementId) ?? NO_TIES), projectId: p.projectId });
  for (const l of lines) ties.set(l.movementId, { ...(ties.get(l.movementId) ?? NO_TIES), lineId: l.lineId });
  return ties;
}

/** The database row of a movement as the calculation engine reads it (thousandths, ten-thousandths), with what it is tied to. */
export function movementInput(row: typeof stockMovement.$inferSelect, ties: MovementTies = NO_TIES): MovementInput {
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
    movementTies(reader),
  ]);
  return { items: items.map(itemInput), movements: movements.map((m) => movementInput(m, ties.get(m.id))), parts: parts.map(partInput) };
}

/** The movements of one item, read inside a write after the item has been locked. */
export async function movementsOf(tx: Tx, itemId: number): Promise<MovementInput[]> {
  // what the stock of a place is does not depend on the project or the purchase: they are left out
  return (await tx.select().from(stockMovement).where(eq(stockMovement.itemId, itemId))).map((m) => movementInput(m));
}
