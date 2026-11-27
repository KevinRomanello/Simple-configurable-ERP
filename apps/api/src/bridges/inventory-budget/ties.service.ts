import type { ReceiptInput } from "@erp/calc";
import { eq } from "drizzle-orm";
import type { Db } from "../../core/contracts";
import { anyOf } from "../../core/sql";
import { itemMakeProject, movementProject, receiptLine } from "../../db/schema/inventory-budget";
import { lineCars } from "../../modules/budget/budget.public";
import { movementsByIds, type MovementTie } from "../../modules/inventory/inventory.public";

// What the three tables of the bridge say (docs/inventario.md): the purchase of the budget a receipt completes, the project a movement was for,
// and the project «Make new» starts from. What the inventory and the budget ask of the bridge is answered from here (the contract file wires it).

/** The ties of these movements, or of every movement (two small tables: read whole when every movement is asked for). */
export async function tiesOf(reader: Db, movementIds?: number[]): Promise<MovementTie[]> {
  if (movementIds !== undefined && movementIds.length === 0) return [];
  const [projects, lines] = await Promise.all([
    reader.select({ movementId: movementProject.movementId, projectId: movementProject.projectId }).from(movementProject).where(movementIds === undefined ? undefined : anyOf(movementProject.movementId, movementIds)),
    reader.select({ movementId: receiptLine.movementId, lineId: receiptLine.lineId }).from(receiptLine).where(movementIds === undefined ? undefined : anyOf(receiptLine.movementId, movementIds)),
  ]);
  const ties = new Map<number, MovementTie>();
  const of = (movementId: number) => ties.get(movementId) ?? ties.set(movementId, { movementId, projectId: null, lineId: null }).get(movementId)!;
  for (const p of projects) of(p.movementId).projectId = p.projectId;
  for (const l of lines) of(l.movementId).lineId = l.lineId;
  return [...ties.values()];
}

/** The project these movements were for (already checked by the inventory). */
export async function keepMovementProjectIn(tx: Db, input: { movementIds: number[]; projectId: number }) {
  if (input.movementIds.length > 0) await tx.insert(movementProject).values(input.movementIds.map((movementId) => ({ movementId, projectId: input.projectId })));
}

/** The project «Make new» starts from, for these items or every item. */
export async function makeProjectsOf(reader: Db, itemIds?: number[]): Promise<{ itemId: number; projectId: number }[]> {
  if (itemIds !== undefined && itemIds.length === 0) return [];
  return reader.select({ itemId: itemMakeProject.itemId, projectId: itemMakeProject.projectId }).from(itemMakeProject).where(itemIds === undefined ? undefined : anyOf(itemMakeProject.itemId, itemIds));
}

/** Sets, or with null takes away, the project «Make new» starts from. */
export async function setMakeProject(tx: Db, input: { itemId: number; projectId: number | null }) {
  await tx.delete(itemMakeProject).where(eq(itemMakeProject.itemId, input.itemId));
  if (input.projectId !== null) await tx.insert(itemMakeProject).values({ itemId: input.itemId, projectId: input.projectId });
}

/** How much of each line has arrived and the day of its last receipt (ARRIVED, and the arrival date of ACTUAL). */
export async function lineReceiptsOf(reader: Db): Promise<ReceiptInput[]> {
  const ties = await reader.select({ movementId: receiptLine.movementId, lineId: receiptLine.lineId }).from(receiptLine);
  const movements = new Map((await movementsByIds(reader, ties.map((t) => t.movementId))).map((m) => [m.id, m]));
  const byLine = new Map<number, ReceiptInput>();
  for (const tie of ties) {
    const movement = movements.get(tie.movementId);
    if (!movement || movement.kind !== "receipt") continue;
    const line = byLine.get(tie.lineId) ?? { lineId: tie.lineId, quantityMilli: 0, lastOn: null };
    line.quantityMilli += movement.quantityMilli;
    if (line.lastOn === null || movement.on > line.lastOn) line.lastOn = movement.on;
    byLine.set(tie.lineId, line);
  }
  return [...byLine.values()];
}

/** The car each of these receipts is for through the purchase it completes: the car of its line. */
export async function carsOfReceipts(reader: Db, movementIds: number[]): Promise<{ movementId: number; seasonId: number }[]> {
  const ties = await reader.select({ movementId: receiptLine.movementId, lineId: receiptLine.lineId }).from(receiptLine).where(anyOf(receiptLine.movementId, movementIds));
  const cars = await lineCars(reader, [...new Set(ties.map((t) => t.lineId))]);
  return ties.flatMap((t) => (cars.has(t.lineId) ? [{ movementId: t.movementId, seasonId: cars.get(t.lineId)! }] : []));
}
