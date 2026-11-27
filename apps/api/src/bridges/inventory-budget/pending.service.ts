import { linePricesE4, pendingLines } from "@erp/calc";
import { conflict, invalid, notFound } from "../../core/errors";
import { fromScaled } from "../../core/money";
import { anyOf } from "../../core/sql";
import { today } from "../../core/today";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { movementProject, receiptLine } from "../../db/schema/inventory-budget";
import { getCurrentSeason } from "../../platform/seasons/seasons.service";
import { computedLines, lockLine, projectsOfSeason } from "../../modules/budget/budget.public";
import { assertCanManageInventory, checkReceipt, itemIdentities, movementsByIds, receiveIn, type ReceiptOfPurchaseInput } from "../../modules/inventory/inventory.public";

// What the budget bought and the inventory receives (docs/inventario.md): PENDING, an arrival for a line of the budget, and the projects a
// movement of the shelf can be for. The budget says what was bought and at what price; the inventory puts the goods on the shelf.

/**
 * What the budget has bought and has not fully received, the oldest purchase first. For each one, the item earlier arrivals went to, and the
 * item it probably is (the one with the same name, brand and model, or else the only one with the same name): the form starts from them.
 */
export async function listPending() {
  const pending = pendingLines(await computedLines(await getCurrentSeason()), today());
  if (pending.length === 0) return [];

  // the item of the latest arrival of each line
  const ties = await db.select({ movementId: receiptLine.movementId, lineId: receiptLine.lineId }).from(receiptLine).where(anyOf(receiptLine.lineId, pending.map((p) => p.lineId)));
  const movements = new Map((await movementsByIds(db, ties.map((t) => t.movementId))).map((m) => [m.id, m]));
  const latest = new Map<number, { movementId: number; itemId: number }>();
  for (const tie of ties) {
    const movement = movements.get(tie.movementId);
    if (!movement || movement.kind !== "receipt") continue;
    const before = latest.get(tie.lineId);
    if (!before || movement.id > before.movementId) latest.set(tie.lineId, { movementId: movement.id, itemId: movement.itemId });
  }

  const items = await itemIdentities(db);
  const same = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  const suggested = (p: { item: string; brand: string | null; model: string | null }) => {
    const named = items.filter((i) => same(i.name, p.item));
    return (named.find((i) => same(i.brand, p.brand) && same(i.model, p.model)) ?? (named.length === 1 ? named[0] : undefined))?.id ?? null;
  };
  return pending.map((p) => ({ ...p, receivedItemId: latest.get(p.lineId)?.itemId ?? null, suggestedItemId: suggested(p) }));
}

/**
 * Goods arrive for a line of the budget (POST /api/inventory-budget/pending/:lineId/receive): they take the prices, the project and the car of
 * the line, and the purchase can arrive in parts, never more than what was bought. The item is an existing one or is created here.
 */
export async function receiveFromLine(lineId: number, input: ReceiptOfPurchaseInput) {
  const actor = await assertCanManageInventory();
  const quantityMilli = await checkReceipt(input);
  return runWrite(actor, async (tx) => {
    // two arrivals of the same purchase at the same moment take turns: the second one then sees the first
    if (!(await lockLine(tx, lineId))) throw notFound("Budget line");
    const line = (await computedLines(await getCurrentSeason())).find((l) => l.id === lineId);
    const prices = line && linePricesE4(line);
    if (!line || !prices) throw invalid("This line has not been bought yet: there is nothing to receive");
    const remaining = line.arrival.boughtMilli - line.arrival.receivedMilli;
    if (quantityMilli > remaining) {
      throw conflict(remaining > 0 ? `Only ${fromScaled(remaining, 3)} are still to arrive for this line` : "Everything bought on this line has already arrived");
    }
    const { movement, item } = await receiveIn(tx, input, quantityMilli, { prices, make: { brand: line.brand, model: line.model } });
    await tx.insert(receiptLine).values({ movementId: movement.id, lineId });
    await tx.insert(movementProject).values({ movementId: movement.id, projectId: line.projectId });
    return { movement: { ...movement, projectId: line.projectId, budgetLineId: lineId }, item };
  });
}

/** The projects stock can be used for: those of the season chosen in the menu (the derived area's are not rows of the database, so not here). */
export async function listProjects() {
  const projects = await projectsOfSeason(db, (await getCurrentSeason()).id);
  return projects.sort((a, b) => a.areaName.localeCompare(b.areaName) || a.name.localeCompare(b.name));
}
