import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { orderLine, purchaseOrder } from "../../db/schema/treasury-budget";
import { canWrite, getCurrentUser, type User } from "../../platform/auth/auth.service";
import { can } from "../../platform/platform.public";
import { assertSeasonOpen } from "../../platform/seasons/seasons.service";
import { lineFacts } from "../../modules/budget/budget.public";
import type { UpdateOrderInput } from "./treasury-budget.schema";

// The orders of TO PAY (docs/registro-di-cassa.md, section 5.3): lines of the budget bought together, one order, one invoice, one bank
// transfer. Who keeps the budget groups them (canGroupOrders); paying them stays the treasury's. An order is of one season, like its lines; a
// line is in one order at most; an order left without lines goes by itself (a trigger of the database, migration 0043).

type Facts = Awaited<ReturnType<typeof lineFacts>>;

/** Who may put a line in an order or take it out: who may change the line (its area), and the treasury and the admins, who group to pay. */
export async function mayGroupLine(actor: User, areaId: number): Promise<boolean> {
  return can(actor, "canManageCash") || (await canWrite(actor, areaId));
}

/** The person may change the orders at all (admins and users; a viewer only looks). */
async function orderActor(): Promise<User> {
  const actor = await getCurrentUser();
  if (!can(actor, "canGroupOrders")) throw forbidden("You cannot change the orders");
  return actor;
}

/** The facts of these lines, every one of them there, all of the same season (`seasonId` when the order has one already). */
async function linesOf(tx: Tx, lineIds: number[], seasonId?: number): Promise<{ facts: Facts; seasonId: number }> {
  const facts = await lineFacts(tx, lineIds);
  if (facts.size !== lineIds.length) throw notFound("Line");
  const seasons = new Set([...facts.values()].map((f) => f.seasonId));
  if (seasonId !== undefined) seasons.add(seasonId);
  if (seasons.size > 1) throw invalid("Lines of different seasons cannot be one order");
  return { facts, seasonId: [...seasons][0]! };
}

/** Every one of these lines may be grouped by the person: the error names the first that may not. */
async function assertMayGroup(actor: User, facts: Facts) {
  for (const f of facts.values()) {
    if (!(await mayGroupLine(actor, f.areaId))) throw forbidden(`You cannot change "${f.item}" (area ${f.areaName})`);
  }
}

/** No other order of the season has this name, whatever the case. */
async function assertFreeName(tx: Tx, seasonId: number, name: string, except?: number) {
  const [taken] = await tx
    .select({ id: purchaseOrder.id })
    .from(purchaseOrder)
    .where(and(eq(purchaseOrder.seasonId, seasonId), sql`lower(${purchaseOrder.name}) = lower(${name})`, except === undefined ? undefined : ne(purchaseOrder.id, except)));
  if (taken) throw conflict(`There is already an order "${name}"`);
}

/** Puts lines in an order: a line that was in another order moves (and that order goes, if it is left empty). */
async function putLines(tx: Tx, orderId: number, lineIds: number[]) {
  if (lineIds.length === 0) return;
  await tx
    .insert(orderLine)
    .values(lineIds.map((lineId) => ({ lineId, orderId })))
    .onConflictDoUpdate({ target: orderLine.lineId, set: { orderId } });
}

/** Groups lines of the budget into a new order. */
export async function createOrder(input: { name: string; lineIds: number[] }) {
  const actor = await orderActor();
  return runWrite(actor, async (tx) => {
    const { facts, seasonId } = await linesOf(tx, input.lineIds);
    await assertSeasonOpen(tx, seasonId);
    await assertMayGroup(actor, facts);
    await assertFreeName(tx, seasonId, input.name);
    const [order] = await tx.insert(purchaseOrder).values({ seasonId, name: input.name }).returning({ id: purchaseOrder.id, name: purchaseOrder.name, seasonId: purchaseOrder.seasonId });
    await putLines(tx, order!.id, input.lineIds);
    return order!;
  });
}

/** The order, kept from changing until the transaction ends, and the lines in it. */
async function lockOrder(tx: Tx, orderId: number) {
  const [order] = await tx.select().from(purchaseOrder).where(eq(purchaseOrder.id, orderId)).for("update");
  if (!order) throw notFound("Order");
  const lines = (await tx.select({ lineId: orderLine.lineId }).from(orderLine).where(eq(orderLine.orderId, orderId))).map((r) => r.lineId);
  return { order, lines };
}

/** Renames an order, puts lines in it and takes lines out. Renaming it needs the right to change every line of it. */
export async function updateOrder(orderId: number, input: UpdateOrderInput) {
  const actor = await orderActor();
  await runWrite(actor, async (tx) => {
    const { order, lines } = await lockOrder(tx, orderId);
    await assertSeasonOpen(tx, order.seasonId);
    if (input.name !== undefined && input.name !== order.name) {
      await assertMayGroup(actor, await lineFacts(tx, lines));
      await assertFreeName(tx, order.seasonId, input.name, order.id);
      await tx.update(purchaseOrder).set({ name: input.name }).where(eq(purchaseOrder.id, order.id));
    }
    const adding = (input.addLineIds ?? []).filter((id) => !lines.includes(id));
    if (adding.length > 0) {
      const { facts } = await linesOf(tx, adding, order.seasonId);
      await assertMayGroup(actor, facts);
      await putLines(tx, order.id, adding);
    }
    const removing = input.removeLineIds ?? [];
    if (removing.length > 0) {
      if (removing.some((id) => !lines.includes(id))) throw invalid("A line to take out is not in this order");
      await assertMayGroup(actor, await lineFacts(tx, removing));
      // taking out the last lines takes the order away too (the trigger)
      await tx.delete(orderLine).where(and(eq(orderLine.orderId, order.id), inArray(orderLine.lineId, removing)));
    }
  });
}

/** Ungroups an order: its lines stay, without an order. It needs the right to change every line of it. */
export async function deleteOrder(orderId: number) {
  const actor = await orderActor();
  await runWrite(actor, async (tx) => {
    const { order, lines } = await lockOrder(tx, orderId);
    await assertSeasonOpen(tx, order.seasonId);
    await assertMayGroup(actor, await lineFacts(tx, lines));
    await tx.delete(purchaseOrder).where(eq(purchaseOrder.id, order.id));
  });
}

// --- what TO PAY and the payments read of the orders ------------------------------------------------------------------------------

export interface OrderOfLine {
  orderId: number;
  orderName: string;
}

/** The order each line of these seasons is in, by line (a line in none is not there): only the orders of the seasons asked are read. */
export async function ordersOfLines(seasonIds: number[]): Promise<Map<number, OrderOfLine>> {
  if (seasonIds.length === 0) return new Map();
  const rows = await db
    .select({ lineId: orderLine.lineId, orderId: purchaseOrder.id, orderName: purchaseOrder.name })
    .from(orderLine)
    .innerJoin(purchaseOrder, eq(orderLine.orderId, purchaseOrder.id))
    .where(inArray(purchaseOrder.seasonId, seasonIds));
  return new Map(rows.map(({ lineId, ...order }) => [lineId, order]));
}

/**
 * The orders of these seasons, for TO PAY: each with whether the person may rename or ungroup it (the treasury and the admins always; a user
 * when they may change every line of it, of any area).
 */
export async function ordersOfSeasons(actor: User, seasonIds: number[]) {
  if (seasonIds.length === 0) return [];
  const orders = await db.select().from(purchaseOrder).where(inArray(purchaseOrder.seasonId, seasonIds)).orderBy(purchaseOrder.name);
  const links = orders.length === 0 ? [] : await db.select().from(orderLine).where(inArray(orderLine.orderId, orders.map((o) => o.id)));
  const facts = await lineFacts(db, links.map((l) => l.lineId));
  const out = [];
  for (const order of orders) {
    let canChange = true;
    for (const link of links.filter((l) => l.orderId === order.id)) {
      const f = facts.get(link.lineId);
      if (f && !(await mayGroupLine(actor, f.areaId))) canChange = false;
    }
    out.push({ id: order.id, name: order.name, seasonId: order.seasonId, canChange });
  }
  return out;
}
