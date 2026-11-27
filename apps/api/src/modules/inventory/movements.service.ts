import { buildNeeds, builtPricesE4, costContext, roundDiv, stockRows, takeFromShelf, type Take, type UnitPricesE4 } from "@erp/calc";
import { asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { contracts } from "../../core/contracts";
import { conflict, invalid, notFound } from "../../core/errors";
import { fromScaled, toScaled } from "../../core/money";
import { runWrite, type Tx } from "../../core/tx";
import { componentPart, inventoryItem, stockMovement } from "../../db/schema/inventory";
import { listVatRates } from "../../platform/lookups/lookups.service";
import { currentActive } from "../../platform/platform.public";
import { assertCarExists } from "../../platform/seasons/seasons.service";
import { loadInventory, movementsOf } from "./inventory.data";
import { buildNeedsProject, keepMovementProject, knownProjects } from "./inventory.ports";
import type { buildInput, movementInput, ReceiptOfPurchaseInput, receiveInput } from "./inventory.schema";
import { assertCanManageInventory, findDuplicate, insertItem } from "./items.service";
import { listLocations } from "./lists.service";

async function assertLocation(code: string) {
  if (!(await listLocations()).some((l) => l.code === code)) throw invalid(`Unknown location "${code}"`);
}

/** The project a movement is for must be one the budget has (there is none to choose when the budget is off). */
async function assertProject(tx: Tx, projectId: number) {
  const found = await contracts.ask(knownProjects, currentActive(), tx, { ids: [projectId] });
  if (found.length === 0) throw notFound("Project");
}

/** Hands the project these movements were for to whoever keeps it (the bridge to the budget), in the same transaction. */
async function tieToProject(tx: Tx, movementIds: number[], projectId: number | null) {
  if (projectId !== null && movementIds.length > 0) await contracts.ask(keepMovementProject, currentActive(), tx, { movementIds, projectId });
}

/** A movement as the writes answer it: its row, with the project and the purchase it is tied to. */
const answered = (movement: typeof stockMovement.$inferSelect, ties: { projectId: number | null; lineId?: number | null }) => ({
  ...movement,
  projectId: ties.projectId,
  budgetLineId: ties.lineId ?? null,
});

// --- goods that arrive ----------------------------------------------------------------------------

/**
 * An item that has no brand or model takes those of the purchase it arrives for (what is already written is never replaced),
 * unless another item is already exactly that: then it is left as it is.
 */
async function takeMakeFromPurchase(tx: Tx, item: typeof inventoryItem.$inferSelect, make: { brand: string | null; model: string | null }) {
  const brand = item.brand ?? make.brand;
  const model = item.model ?? make.model;
  if (brand === item.brand && model === item.model) return item;
  if (await findDuplicate(tx, { name: item.name, brand, model, code: null }, item.id)) return item;
  const [updated] = await tx.update(inventoryItem).set({ brand, model }).where(eq(inventoryItem.id, item.id)).returning();
  return updated!;
}

/** Prices of goods that did not come from the budget: typed net price, VAT rate, and whether it was a gift. */
async function typedPrices(input: { unitNet?: string; vatRate?: number; free: boolean }): Promise<UnitPricesE4> {
  const net = toScaled(input.unitNet, 4);
  const rate = input.vatRate ?? 0;
  if (!(await listVatRates()).includes(rate)) throw invalid(`VAT rate ${rate}% is not one of the allowed rates`);
  const gross = roundDiv(net * (10_000 + Math.round(rate * 100)), 10_000);
  return { net, gross, team: input.free ? 0 : gross };
}

/** The place and the quantity of an arrival, checked before anything is written: the quantity in thousandths. */
export async function checkReceipt(input: { location: string; quantity: string }): Promise<number> {
  await assertLocation(input.location);
  const quantityMilli = toScaled(input.quantity, 3);
  if (quantityMilli <= 0) throw invalid("The quantity must be above zero");
  return quantityMilli;
}

/**
 * Puts goods on the shelf inside a transaction that is already open, at the prices given: the inventory's own arrivals (priced by hand)
 * and the purchases of the budget (priced by the budget, through the bridge) both end here. The item is an existing one or is created here;
 * an existing one takes the brand and the model of the purchase it is missing.
 */
export async function receiveIn(
  tx: Tx,
  input: ReceiptOfPurchaseInput & { carSeasonId?: number },
  quantityMilli: number,
  priced: { prices: UnitPricesE4; make: { brand: string | null; model: string | null } | null },
) {
  await assertCarExists(tx, input.carSeasonId);
  let item;
  if (input.newItem) {
    item = await insertItem(tx, input.newItem);
  } else {
    [item] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, input.itemId!));
    if (!item) throw notFound("Item");
    if (priced.make) item = await takeMakeFromPurchase(tx, item, priced.make);
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
      unitNet: fromScaled(priced.prices.net, 4),
      unitGross: fromScaled(priced.prices.gross, 4),
      unitTeam: fromScaled(priced.prices.team, 4),
      carSeasonId: input.carSeasonId ?? null,
      note: input.note ?? null,
    })
    .returning();
  return { movement: movement!, item };
}

/**
 * Puts goods from outside the budget on the shelf, priced by hand (a purchase of the budget arrives through the bridge to the budget,
 * which prices it). The project it is for, if any, is kept by the bridge.
 */
export async function receive(input: z.infer<typeof receiveInput>) {
  const actor = await assertCanManageInventory();
  const quantityMilli = await checkReceipt(input);
  return runWrite(actor, async (tx) => {
    const prices = await typedPrices(input);
    const projectId = input.projectId ?? null;
    if (projectId !== null) await assertProject(tx, projectId);
    const { movement, item } = await receiveIn(tx, input, quantityMilli, { prices, make: null });
    await tieToProject(tx, [movement.id], projectId);
    return { movement: answered(movement, { projectId }), item };
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
        note: input.note ?? null,
      })
      .returning();
    const projectId = input.projectId ?? null;
    await tieToProject(tx, [movement!.id], projectId);
    return answered(movement!, { projectId });
  });
}

// --- what the team makes ---------------------------------------------------------------------------

/**
 * Records that the team made `quantity` pieces of a made item: the parts leave the shelf (as uses: from every place, the
 * one with the most first, or from the place `takeFrom` names for a part; spot by spot) and the pieces arrive with their cost frozen. The cost is that of
 * the parts as they are worth on the shelf that day (what they were bought or built for), so the
 * pieces already made keep theirs when a part gets dearer: only the next build uses the new price.
 */
export async function build(input: z.infer<typeof buildInput>) {
  const actor = await assertCanManageInventory();
  await assertLocation(input.toLocation);
  const sources = new Map(Object.entries(input.takeFrom).map(([partId, code]) => [Number(partId), code]));
  for (const code of new Set(sources.values())) await assertLocation(code);
  const quantityMilli = toScaled(input.quantity, 3);
  if (quantityMilli <= 0) throw invalid("The quantity must be above zero");

  return runWrite(actor, async (tx) => {
    const projectId = input.projectId ?? null;
    if (projectId !== null) await assertProject(tx, projectId);
    else if (await contracts.ask(buildNeedsProject, currentActive(), tx, {})) throw invalid("Choose the project the pieces are made for");
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
    const takes: (Take & { itemId: number })[] = [];
    const short: string[] = [];
    const places = await listLocations();
    for (const need of buildNeeds(data.parts.filter((p) => p.componentId === made.id), quantityMilli)) {
      const place = sources.get(need.partId);
      const taken = takeFromShelf(stock.filter((r) => r.itemId === need.partId), need.quantityMilli, place);
      takes.push(...taken.takes.map((t) => ({ itemId: need.partId, ...t })));
      if (taken.missingMilli > 0) {
        const part = names.get(need.partId)!;
        const where = place ? ` at ${places.find((l) => l.code === place)?.label ?? place}` : "";
        short.push(`${fromScaled(need.quantityMilli, 3)} ${part.unit} of "${part.name}" (${fromScaled(need.quantityMilli - taken.missingMilli, 3)} there${where})`);
      }
    }
    if (short.length > 0) throw conflict(`Not enough on the shelf: it takes ${short.join(", ")}`);

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
        note: input.note ?? null,
      })
      .returning();
    // The parts are linked to the build (`builtBy`): they are used for its project and go back with it if it is undone.
    const note = `Used to build ${input.quantity} × ${made.name}`;
    const parts = takes.length === 0 ? [] : await tx
      .insert(stockMovement)
      .values(
        takes.map((t) => ({
          itemId: t.itemId, kind: "use" as const, occurredOn: input.builtOn, quantity: fromScaled(t.quantityMilli, 3),
          location: t.location, spot: t.spot, builtBy: movement!.id, note,
        })),
      )
      .returning({ id: stockMovement.id });
    await tieToProject(tx, [movement!.id, ...parts.map((p) => p.id)], projectId);
    return { movement: answered(movement!, { projectId }), used: takes.length };
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
