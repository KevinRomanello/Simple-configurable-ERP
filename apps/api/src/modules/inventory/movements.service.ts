import { computeLines, linePricesE4, pendingLines, roundDiv, stockRows, type UnitPricesE4 } from "@erp/calc";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { conflict, invalid, notFound } from "../../core/errors";
import { fromScaled, toScaled } from "../../core/money";
import { today } from "../../core/today";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, inventoryItem, project, stockMovement } from "../../db/schema";
import { loadSnapshot } from "../../snapshot";
import { listLocations, listVatRates } from "../lookups/lookups.service";
import { movementsOf } from "./inventory.data";
import type { movementInput, receiveInput } from "./inventory.schema";
import { assertCanManageInventory, insertItem } from "./items.service";

async function assertLocation(code: string) {
  if (!(await listLocations()).some((l) => l.code === code)) throw invalid(`Unknown location "${code}"`);
}

async function assertProject(tx: Pick<Tx, "select">, projectId: number) {
  const [found] = await tx.select({ id: project.id }).from(project).where(eq(project.id, projectId));
  if (!found) throw notFound("Project");
}

// --- goods that arrive ----------------------------------------------------------------------------

/**
 * What the budget has bought and has not fully received, the oldest purchase first. For each one,
 * the item earlier arrivals went to, and an item with the same name if there is one: the form
 * starts from them.
 */
export async function listPending() {
  const lines = computeLines(await loadSnapshot());
  const pending = pendingLines(lines, today());
  if (pending.length === 0) return [];

  const earlier = await db
    .select({ lineId: stockMovement.budgetLineId, itemId: stockMovement.itemId })
    .from(stockMovement)
    .where(and(eq(stockMovement.kind, "receipt"), inArray(stockMovement.budgetLineId, pending.map((p) => p.lineId))))
    .orderBy(desc(stockMovement.id));
  const lastItemOfLine = new Map<number, number>();
  for (const e of earlier) if (e.lineId !== null && !lastItemOfLine.has(e.lineId)) lastItemOfLine.set(e.lineId, e.itemId);
  const byName = new Map((await db.select({ id: inventoryItem.id, name: inventoryItem.name }).from(inventoryItem)).map((i) => [i.name.toLowerCase(), i.id]));

  return pending.map((p) => ({
    ...p,
    receivedItemId: lastItemOfLine.get(p.lineId) ?? null,
    suggestedItemId: byName.get(p.item.toLowerCase()) ?? null,
  }));
}

/** Prices of goods that did not come from the budget: typed net price, VAT rate, and whether it was a gift. */
async function typedPrices(input: { unitNet?: string; vatRate?: number; free: boolean }): Promise<UnitPricesE4> {
  const net = toScaled(input.unitNet, 4);
  const rate = input.vatRate ?? 0;
  if (!(await listVatRates()).includes(rate)) throw invalid(`VAT rate ${rate}% is not one of the allowed rates`);
  const gross = roundDiv(net * (10_000 + Math.round(rate * 100)), 10_000);
  return { net, gross, team: input.free ? 0 : gross };
}

/**
 * Puts goods on the shelf. A purchase of the budget gets its prices from the budget and can
 * arrive in parts, never more than what was bought; goods from outside the budget are priced by
 * hand. The item is an existing one or is created here.
 */
export async function receive(input: z.infer<typeof receiveInput>) {
  const actor = await assertCanManageInventory();
  await assertLocation(input.location);
  const quantityMilli = toScaled(input.quantity, 3);
  if (quantityMilli <= 0) throw invalid("The quantity must be above zero");

  return runWrite(actor, async (tx) => {
    let prices: UnitPricesE4;
    let projectId = input.projectId ?? null;

    if (input.lineId !== undefined) {
      // Two arrivals of the same purchase at the same moment take turns: the second one then sees the first.
      const [locked] = await tx.select({ id: budgetLine.id }).from(budgetLine).where(eq(budgetLine.id, input.lineId)).for("update");
      if (!locked) throw notFound("Budget line");
      const line = computeLines(await loadSnapshot()).find((l) => l.id === input.lineId);
      const linePrices = line && linePricesE4(line);
      if (!line || !linePrices) throw invalid("This line has not been bought yet: there is nothing to receive");
      const remaining = line.arrival.boughtMilli - line.arrival.receivedMilli;
      if (quantityMilli > remaining) {
        throw conflict(remaining > 0 ? `Only ${fromScaled(remaining, 3)} are still to arrive for this line` : "Everything bought on this line has already arrived");
      }
      prices = linePrices;
      projectId = line.projectId;
    } else {
      prices = await typedPrices(input);
    }
    if (input.lineId === undefined && projectId !== null) await assertProject(tx, projectId);

    let item;
    if (input.newItem) {
      item = await insertItem(tx, input.newItem);
    } else {
      [item] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, input.itemId!));
      if (!item) throw notFound("Item");
    }

    const [movement] = await tx
      .insert(stockMovement)
      .values({
        itemId: item.id,
        kind: "receipt",
        occurredOn: input.receivedOn,
        quantity: fromScaled(quantityMilli, 3),
        location: input.location,
        spot: input.spot,
        unitNet: fromScaled(prices.net, 4),
        unitGross: fromScaled(prices.gross, 4),
        unitTeam: fromScaled(prices.team, 4),
        projectId,
        budgetLineId: input.lineId ?? null,
        note: input.note ?? null,
      })
      .returning();
    return { movement: movement!, item };
  });
}

// --- everything else that happens on the shelf ---------------------------------------------------

/**
 * Uses, transfers, counts and disposals. Nothing can leave a place that does not hold enough of
 * it; a count states how many there really are, and the difference is recorded.
 */
export async function addMovement(input: z.infer<typeof movementInput>) {
  const actor = await assertCanManageInventory();
  await assertLocation(input.location);
  if (input.toLocation) await assertLocation(input.toLocation);
  if (input.kind === "transfer" && input.toLocation === input.location && (input.toSpot ?? "") === input.spot) {
    throw invalid("The destination is the place where it already is");
  }

  return runWrite(actor, async (tx) => {
    // Everything that touches the stock of one item takes turns, so that two removals cannot both pass the check.
    const [item] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, input.itemId)).for("update");
    if (!item) throw notFound("Item");
    if (input.projectId !== undefined) await assertProject(tx, input.projectId);

    const here = stockRows(await movementsOf(tx, item.id)).find((r) => r.location === input.location && r.spot === input.spot)?.quantityMilli ?? 0;
    let quantityMilli: number;
    if (input.kind === "adjustment") {
      quantityMilli = toScaled(input.counted, 3) - here;
      if (quantityMilli === 0) throw invalid("The count is the same as what is recorded: there is nothing to correct");
    } else {
      quantityMilli = toScaled(input.quantity, 3);
      if (quantityMilli <= 0) throw invalid("The quantity must be above zero");
      if (quantityMilli > here) throw conflict(`Only ${fromScaled(here, 3)} ${item.unit} of "${item.name}" are recorded at this place`);
    }

    const [movement] = await tx
      .insert(stockMovement)
      .values({
        itemId: item.id,
        kind: input.kind,
        occurredOn: input.occurredOn,
        quantity: fromScaled(quantityMilli, 3),
        location: input.location,
        spot: input.spot,
        toLocation: input.kind === "transfer" ? input.toLocation! : null,
        toSpot: input.kind === "transfer" ? (input.toSpot ?? "") : null,
        projectId: input.projectId ?? null,
        note: input.note ?? null,
      })
      .returning();
    return movement!;
  });
}
