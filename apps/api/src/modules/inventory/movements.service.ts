import { buildNeeds, builtPricesE4, computeLines, costContext, linePricesE4, pendingLines, roundDiv, stockRows, type UnitPricesE4 } from "@erp/calc";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { conflict, invalid, notFound } from "../../core/errors";
import { fromScaled, toScaled } from "../../core/money";
import { today } from "../../core/today";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, componentPart, inventoryItem, project, stockMovement } from "../../db/schema";
import { loadSnapshot } from "../../snapshot";
import { listLocations, listVatRates } from "../lookups/lookups.service";
import { loadInventory, movementsOf } from "./inventory.data";
import type { buildInput, movementInput, receiveInput } from "./inventory.schema";
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

// --- what the team makes ---------------------------------------------------------------------------

/**
 * Records that the team made `quantity` pieces of a made item: the parts leave the shelf (as uses, from
 * the place given, spot by spot) and the pieces arrive with their cost frozen. The cost is that of
 * the parts as they are worth on the shelf that day (what they were bought or built for), so the
 * pieces already made keep theirs when a part gets dearer: only the next build uses the new price.
 */
export async function build(input: z.infer<typeof buildInput>) {
  const actor = await assertCanManageInventory();
  await assertLocation(input.fromLocation);
  await assertLocation(input.toLocation);
  const quantityMilli = toScaled(input.quantity, 3);
  if (quantityMilli <= 0) throw invalid("The quantity must be above zero");

  return runWrite(actor, async (tx) => {
    await assertProject(tx, input.projectId);
    // The piece and its parts take turns with every other change of their stock (in the same order
    // for everybody, so that two builds cannot wait for each other).
    const links = await tx.select().from(componentPart).where(eq(componentPart.componentId, input.componentId));
    const locked = await tx
      .select()
      .from(inventoryItem)
      .where(inArray(inventoryItem.id, [input.componentId, ...links.map((l) => l.partId)]))
      .orderBy(asc(inventoryItem.id))
      .for("update");
    const made = locked.find((i) => i.id === input.componentId);
    if (!made) throw notFound("Item");
    if (made.origin !== "made") throw invalid(`"${made.name}" is not made by the team: it has no parts to build it from`);
    if (links.length === 0) throw invalid(`"${made.name}" has no parts yet: add them before building it`);

    const data = await loadInventory(tx);
    const names = new Map(data.items.map((i) => [i.id, i]));
    const stock = stockRows(data.movements);
    const takes: { itemId: number; spot: string; quantityMilli: number }[] = [];
    const short: string[] = [];
    for (const need of buildNeeds(data.parts.filter((p) => p.componentId === made.id), quantityMilli)) {
      let left = need.quantityMilli;
      for (const row of stock.filter((r) => r.itemId === need.partId && r.location === input.fromLocation && r.quantityMilli > 0)) {
        const take = Math.min(left, row.quantityMilli);
        takes.push({ itemId: need.partId, spot: row.spot, quantityMilli: take });
        left -= take;
        if (left === 0) break;
      }
      if (left > 0) {
        const part = names.get(need.partId)!;
        short.push(`${fromScaled(need.quantityMilli, 3)} ${part.unit} of "${part.name}" (${fromScaled(need.quantityMilli - left, 3)} there)`);
      }
    }
    if (short.length > 0) {
      const place = (await listLocations()).find((l) => l.code === input.fromLocation)?.label ?? input.fromLocation;
      throw conflict(`Not enough at ${place}: it takes ${short.join(", ")}`);
    }

    const contexts = { net: costContext(data, "net"), gross: costContext(data, "gross"), team: costContext(data, "team") };
    const { prices, unpriced } = builtPricesE4(made.id, contexts, input.method, input.builtOn);
    if (unpriced.length > 0) {
      throw conflict(`No price is known for ${unpriced.map((id) => `"${names.get(id)!.name}"`).join(", ")}: buy or receive it with a price before building`);
    }

    const [movement] = await tx
      .insert(stockMovement)
      .values({
        itemId: made.id,
        kind: "build",
        occurredOn: input.builtOn,
        quantity: fromScaled(quantityMilli, 3),
        location: input.toLocation,
        spot: input.toSpot,
        unitNet: fromScaled(prices.net, 4),
        unitGross: fromScaled(prices.gross, 4),
        unitTeam: fromScaled(prices.team, 4),
        projectId: input.projectId,
        note: input.note ?? null,
      })
      .returning();
    // The parts are linked to the build (`builtBy`): they are used for its project and go back with it if it is undone.
    const note = `Used to build ${input.quantity} × ${made.name}`;
    if (takes.length > 0) {
      await tx.insert(stockMovement).values(
        takes.map((t) => ({
          itemId: t.itemId, kind: "use" as const, occurredOn: input.builtOn, quantity: fromScaled(t.quantityMilli, 3),
          location: input.fromLocation, spot: t.spot, projectId: input.projectId, builtBy: movement!.id, note,
        })),
      );
    }
    return { movement: movement!, used: takes.length };
  });
}

// --- undoing ------------------------------------------------------------------------------------------

/**
 * Takes a movement back: it is removed from the register as if it had not happened (the history keeps
 * who recorded it and who undid it). It is refused when what it brought has already been used or moved
 * (the stock of a place would go below zero), and for the parts of a build, which go back only with the build.
 * Undoing a build also removes the uses of its parts; undoing a receipt that completed a purchase of the
 * budget makes that purchase wait for its goods again.
 */
export async function undoMovement(movementId: number) {
  const actor = await assertCanManageInventory();
  return runWrite(actor, async (tx) => {
    const [found] = await tx.select().from(stockMovement).where(eq(stockMovement.id, movementId));
    if (!found) throw notFound("Movement");
    if (found.builtBy !== null) throw conflict("These parts were taken for a build: undo the build and they go back");

    // Same turn-taking as every change of the stock of this item, so that an undo and a use cannot both pass the check.
    const [item] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, found.itemId)).for("update");
    if (!item) throw notFound("Item");
    const all = await movementsOf(tx, item.id);
    const before = stockRows(all);
    const after = stockRows(all.filter((m) => m.id !== movementId));
    const short = after.find((row) => {
      const was = before.find((r) => r.location === row.location && r.spot === row.spot)?.quantityMilli ?? 0;
      return row.quantityMilli < 0 && row.quantityMilli < was;
    });
    if (short) {
      const place = (await listLocations()).find((l) => l.code === short.location)?.label ?? short.location;
      throw conflict(`Cannot undo it: what it brought to ${place}${short.spot ? ` (${short.spot})` : ""} has already been used or moved`);
    }

    const removed = await tx.delete(stockMovement).where(eq(stockMovement.id, movementId)).returning({ id: stockMovement.id });
    if (removed.length === 0) throw notFound("Movement");
  });
}
