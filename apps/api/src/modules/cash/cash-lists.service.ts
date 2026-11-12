import type { CashScope } from "@erp/calc";
import { asc, eq, sql } from "drizzle-orm";
import { conflict, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { cashCategory, cashEntry, cashMethod, category } from "../../db/schema";
import { assertCanManageCash, assertListed } from "./cash.service";

// The two lists of the register, kept in Settings: the Voci and the payment methods. Like the
// categories, what is in use cannot be deleted, and renaming needs no care: movements hold the id.

/** The Voci in their order, with how many movements use each. */
export async function listCashCategories(reader: Pick<Tx, "select"> = db) {
  const rows = await reader
    .select({ id: cashCategory.id, name: cashCategory.name, sponsorship: cashCategory.sponsorship, scope: cashCategory.scope, usedBy: sql<number>`count(${cashEntry.id})::int` })
    .from(cashCategory)
    .leftJoin(cashEntry, eq(cashEntry.categoryId, cashCategory.id))
    .groupBy(cashCategory.id)
    .orderBy(asc(cashCategory.position));
  return rows;
}

export async function listCashMethods(reader: Pick<Tx, "select"> = db) {
  return reader
    .select({ id: cashMethod.id, name: cashMethod.name, usedBy: sql<number>`count(${cashEntry.id})::int` })
    .from(cashMethod)
    .leftJoin(cashEntry, eq(cashEntry.methodId, cashMethod.id))
    .groupBy(cashMethod.id)
    .orderBy(asc(cashMethod.position));
}

export async function createCashCategory(input: { name: string; sponsorship?: boolean; scope?: CashScope }) {
  const actor = await assertCanManageCash();
  return runWrite(actor, async (tx) => {
    const [last] = await tx.select({ position: sql<number>`coalesce(max(${cashCategory.position}), 0)::int` }).from(cashCategory);
    const [created] = await tx.insert(cashCategory).values({ name: input.name, sponsorship: input.sponsorship ?? false, scope: input.scope ?? "project", position: (last?.position ?? 0) + 1 }).returning();
    return created!;
  });
}

export async function updateCashCategory(categoryId: number, input: { name?: string; sponsorship?: boolean; scope?: CashScope }) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    if (Object.keys(input).length === 0) return;
    const updated = await tx.update(cashCategory).set(input).where(eq(cashCategory.id, categoryId)).returning({ id: cashCategory.id });
    if (updated.length === 0) throw notFound("Voce");
  });
}

export async function deleteCashCategory(categoryId: number) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(cashEntry).where(eq(cashEntry.categoryId, categoryId));
    if ((used?.n ?? 0) > 0) throw conflict(`This Voce is used by ${used?.n} movements`);
    const deleted = await tx.delete(cashCategory).where(eq(cashCategory.id, categoryId)).returning({ id: cashCategory.id });
    if (deleted.length === 0) throw notFound("Voce");
  });
}

export async function createCashMethod(input: { name: string }) {
  const actor = await assertCanManageCash();
  return runWrite(actor, async (tx) => {
    const [last] = await tx.select({ position: sql<number>`coalesce(max(${cashMethod.position}), 0)::int` }).from(cashMethod);
    const [created] = await tx.insert(cashMethod).values({ name: input.name, position: (last?.position ?? 0) + 1 }).returning();
    return created!;
  });
}

export async function renameCashMethod(methodId: number, input: { name?: string }) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    if (input.name === undefined) return;
    const updated = await tx.update(cashMethod).set({ name: input.name }).where(eq(cashMethod.id, methodId)).returning({ id: cashMethod.id });
    if (updated.length === 0) throw notFound("Payment method");
  });
}

export async function deleteCashMethod(methodId: number) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(cashEntry).where(eq(cashEntry.methodId, methodId));
    if ((used?.n ?? 0) > 0) throw conflict(`This method is used by ${used?.n} movements`);
    const deleted = await tx.delete(cashMethod).where(eq(cashMethod.id, methodId)).returning({ id: cashMethod.id });
    if (deleted.length === 0) throw notFound("Payment method");
  });
}

/** Sets the order of a list: `ids` must be every id of it, once each. */
async function reorder(tx: Tx, table: typeof cashCategory | typeof cashMethod, ids: number[]) {
  const existing = (await tx.select({ id: table.id }).from(table)).map((r) => r.id).sort((a, b) => a - b);
  if (existing.length !== ids.length || [...ids].sort((a, b) => a - b).some((value, i) => value !== existing[i])) {
    throw invalid("The order must list every item of the list once");
  }
  for (const [index, itemId] of ids.entries()) await tx.update(table).set({ position: index + 1 }).where(eq(table.id, itemId));
}

export async function orderCashCategories(ids: number[]) {
  const actor = await assertCanManageCash();
  await runWrite(actor, (tx) => reorder(tx, cashCategory, ids));
}

export async function orderCashMethods(ids: number[]) {
  const actor = await assertCanManageCash();
  await runWrite(actor, (tx) => reorder(tx, cashMethod, ids));
}

// --- the Voce a payment starts from, for each category of the budget ---------------------------------

/** Every category of the budget with the Voce a payment for one of its lines starts from (TO PAY), or null. */
export async function listCategoryDefaults() {
  await assertCanManageCash();
  const rows = await db.select().from(category).orderBy(asc(category.position), asc(category.id));
  return rows.map((c) => ({ categoryId: c.id, name: c.name, voceId: c.defaultVoceId }));
}

export async function setCategoryDefault(categoryId: number, voceId: number | null) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    await assertListed(tx, voceId, null);
    const changed = await tx.update(category).set({ defaultVoceId: voceId }).where(eq(category.id, categoryId)).returning({ id: category.id });
    if (changed.length === 0) throw notFound("Category");
  });
}
