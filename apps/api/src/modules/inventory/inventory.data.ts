import type { InventoryData, ItemInput, MovementInput, PartInput } from "@erp/calc";
import { eq } from "drizzle-orm";
import { toScaled } from "../../core/money";
import type { Tx } from "../../core/tx";
import { db } from "../../db/client";
import { componentPart, inventoryItem, stockMovement } from "../../db/schema";

type Reader = Pick<typeof db, "select">;

export function itemInput(row: typeof inventoryItem.$inferSelect): ItemInput {
  return { id: row.id, name: row.name, category: row.category, origin: row.origin, unit: row.unit };
}

/** The database row of a movement as the calculation engine reads it (thousandths, ten-thousandths). */
export function movementInput(row: typeof stockMovement.$inferSelect): MovementInput {
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
    projectId: row.projectId,
    lineId: row.budgetLineId,
  };
}

export function partInput(row: typeof componentPart.$inferSelect): PartInput {
  return { componentId: row.componentId, partId: row.partId, quantityMilli: toScaled(row.quantity, 3) };
}

/** Every item, movement and bill of materials: what the inventory calculations start from. */
export async function loadInventory(reader: Reader = db): Promise<InventoryData> {
  const [items, movements, parts] = await Promise.all([
    reader.select().from(inventoryItem),
    reader.select().from(stockMovement),
    reader.select().from(componentPart),
  ]);
  return { items: items.map(itemInput), movements: movements.map(movementInput), parts: parts.map(partInput) };
}

/** The movements of one item, read inside a write after the item has been locked. */
export async function movementsOf(tx: Tx, itemId: number): Promise<MovementInput[]> {
  return (await tx.select().from(stockMovement).where(eq(stockMovement.itemId, itemId))).map(movementInput);
}
