import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../core/contracts";
import { conflict, forbidden } from "../../core/errors";
import { toCents } from "../../core/money";
import { anyOf } from "../../core/sql";
import { cashEntryLine, inflowReceipt } from "../../db/schema/treasury-budget";
import { canManageCash, type User } from "../../platform/auth/auth.service";
import { inflowsByIds, lineLabels, type InflowReceipt } from "../../modules/budget/budget.public";
import { entriesByIds, type EntryLink } from "../../modules/treasury/treasury.public";

// What the two tables of the bridge say (docs/registro-di-cassa.md, section 5): which movement received which expected inflow, and which
// payments paid which lines of the budget. What the register and the budget ask of the bridge is answered from here (the contract file wires it).

/** What each movement is tied to: the inflow it received (with its name, from the budget) and the lines it paid (with their item). */
export async function linksOfEntries(reader: Db): Promise<EntryLink[]> {
  const [receipts, paid] = await Promise.all([
    reader.select({ entryId: inflowReceipt.entryId, inflowId: inflowReceipt.inflowId }).from(inflowReceipt),
    reader.select({ entryId: cashEntryLine.entryId, lineId: cashEntryLine.lineId, amount: cashEntryLine.amount }).from(cashEntryLine).orderBy(asc(cashEntryLine.id)),
  ]);
  const inflows = new Map((await inflowsByIds(reader, receipts.map((r) => r.inflowId))).map((i) => [i.id, i.sourceName]));
  const labels = await lineLabels(reader, [...new Set(paid.map((p) => p.lineId))]);

  const byEntry = new Map<number, EntryLink>();
  const of = (entryId: number) => byEntry.get(entryId) ?? byEntry.set(entryId, { entryId, inflow: null, lines: [] }).get(entryId)!;
  for (const r of receipts) of(r.entryId).inflow = { id: r.inflowId, sourceName: inflows.get(r.inflowId)! };
  for (const p of paid) of(p.entryId).lines.push({ lineId: p.lineId, item: labels.get(p.lineId)!, cents: toCents(p.amount) });
  return [...byEntry.values()];
}

/** The movement that received each of these expected inflows, with its day, amount and sponsorship box (the inflows nobody received are not there). */
export async function receiptsOf(reader: Db, inflowIds: number[]): Promise<InflowReceipt[]> {
  if (inflowIds.length === 0) return [];
  const rows = await reader.select({ inflowId: inflowReceipt.inflowId, entryId: inflowReceipt.entryId }).from(inflowReceipt).where(inArray(inflowReceipt.inflowId, inflowIds));
  const entries = new Map((await entriesByIds(reader, rows.map((r) => r.entryId))).map((e) => [e.id, e]));
  return rows.flatMap((r) => {
    const entry = entries.get(r.entryId);
    return entry ? [{ inflowId: r.inflowId, entryId: entry.id, on: entry.on, cents: entry.cents, sponsorship: entry.sponsorship }] : [];
  });
}

/**
 * What the payments of the register have paid of each of these lines, in cents. The table is small (a row for each line a payment paid), so
 * it is read whole and the lines are picked in the code: cheaper than a list of thousands of ids in the query.
 */
export async function paymentsOfLines(reader: Db, lineIds: number[]): Promise<{ lineId: number; cents: number }[]> {
  const wanted = new Set(lineIds);
  const rows = await reader.select({ lineId: cashEntryLine.lineId, amount: sql<string>`sum(${cashEntryLine.amount})` }).from(cashEntryLine).groupBy(cashEntryLine.lineId);
  return rows.filter((r) => wanted.has(r.lineId)).map((r) => ({ lineId: r.lineId, cents: toCents(r.amount) }));
}

/** A movement that received an inflow stays money in, and one that paid budget lines stays a payment of at least that much. */
export async function assertLinksHold(tx: Db, change: { entryId: number; direction: "in" | "out"; cents: number }) {
  const [inflow] = await tx.select({ id: inflowReceipt.id }).from(inflowReceipt).where(eq(inflowReceipt.entryId, change.entryId));
  const [linked] = await tx.select({ amount: sql<string | null>`sum(${cashEntryLine.amount})` }).from(cashEntryLine).where(eq(cashEntryLine.entryId, change.entryId));
  const paid = linked?.amount == null ? 0 : toCents(linked.amount);
  if (change.direction === "out" && inflow) throw conflict("This movement received an expected inflow: mark it as not received first");
  if (change.direction === "in" && paid > 0) throw conflict("This movement paid budget lines: unlink them first");
  if (change.direction === "out" && change.cents < paid) throw conflict("This movement paid budget lines for more than that: change the links first");
}

/** A received inflow is tied to the register: taking that apart is the treasury's, as marking it received was. */
export async function assertCanDeleteInflow(tx: Db, inflowId: number, actor: User) {
  const [received] = await tx.select({ id: inflowReceipt.id }).from(inflowReceipt).where(eq(inflowReceipt.inflowId, inflowId));
  if (!received || (await canManageCash(actor))) return;
  const [inflow] = await inflowsByIds(tx, [inflowId]);
  throw forbidden(`"${inflow?.sourceName ?? "This inflow"}" is already received: only the treasury can delete it`);
}

/** The movements (of these) that already pay lines of the budget: the ones a payment cannot be tied to twice, and cannot be deleted from here. */
export async function payingEntries(reader: Db, entryIds: number[]): Promise<Set<number>> {
  if (entryIds.length === 0) return new Set();
  const rows = await reader.select({ entryId: cashEntryLine.entryId }).from(cashEntryLine).where(anyOf(cashEntryLine.entryId, entryIds)).groupBy(cashEntryLine.entryId);
  return new Set(rows.map((r) => r.entryId));
}
