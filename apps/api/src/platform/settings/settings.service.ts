import { asc, eq, max, sql } from "drizzle-orm";
import { contracts, type Db } from "../../core/contracts";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { category, setting, vatRate } from "../../db/schema/platform";
import { canKeepCategories, getCurrentUser, requireAdmin } from "../auth/auth.service";
import { categoryCreated, currentActive, lookupRenamed, totalUse, usageOf, type UsageKind, type UsageRow, type UsageSubject } from "../platform.public";

// The Settings page of the core (docs/impostazioni.md). The VAT rates and the seasons are the admin's (the switches of the
// calculation are the budget's: modules/budget/lookups.service.ts); the categories, which the lines and the items are written with, are also kept by the
// project managers. The lists of the inventory (units, places, the fields of a category) are the inventory's
// (modules/inventory/lists.service.ts). Every change goes into the history (the tables have the audit trigger).

async function asAdmin() {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  return actor;
}

/** The categories: the admins and the project managers (the people who write the lines and the items with them). */
async function asCategoryKeeper() {
  const actor = await getCurrentUser();
  if (!(await canKeepCategories(actor))) throw forbidden("Only an admin or a user can change this list");
  return actor;
}

/** Refuses to take away something that is still used, saying by what (the modules that are on say what uses it). */
async function refuseIfUsed(executor: Db, kind: UsageKind, subject: UsageSubject, said: string) {
  const uses: UsageRow[] = (await usageOf(executor, kind, [subject])).get(subject.key) ?? [];
  if (uses.length > 0) throw conflict(`"${said}" is used by ${uses.map((u) => `${u.count} ${u.label}`).join(" and ")}: it cannot be deleted`);
}

const sameName = (column: typeof category.name, name: string) => sql`lower(${column}) = lower(${name})`;

// --- reading -------------------------------------------------------------------------------------

/** What the Settings page of the core shows, with how much each entry is used (GET /api/settings); the switches of the calculation are the budget's. */
export async function readSettings() {
  await asCategoryKeeper();
  const [categories, rates] = await Promise.all([
    db.select().from(category).orderBy(asc(category.position), asc(category.id)),
    db.select().from(vatRate).orderBy(asc(vatRate.rate)),
  ]);
  // who uses each entry: one question per list, answered by the modules that are on
  const [categoryUse, rateUse] = await Promise.all([
    usageOf(db, "category", categories.map((c) => ({ key: String(c.id), name: c.name, id: c.id }))),
    usageOf(db, "vatRate", rates.map((r) => ({ key: String(r.id), name: r.rate }))),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, usedBy: totalUse(categoryUse.get(String(c.id))) })),
    vatRates: rates.map((r) => ({ id: r.id, rate: Number(r.rate), usedBy: totalUse(rateUse.get(String(r.id))) })),
  };
}

// --- categories ----------------------------------------------------------------------------------

/** A new category, last in the order; the modules that keep something for each category start it (`categoryCreated`). */
export async function createCategory(input: { name: string }) {
  const actor = await asCategoryKeeper();
  return runWrite(actor, async (tx) => {
    const [twin] = await tx.select().from(category).where(sameName(category.name, input.name));
    if (twin) throw conflict(`"${twin.name}" already exists`);
    const [last] = await tx.select({ position: max(category.position) }).from(category);
    const [created] = await tx.insert(category).values({ name: input.name, position: (last?.position ?? 0) + 1 }).returning();
    await contracts.emit(categoryCreated, currentActive(), tx, { categoryId: created!.id });
    return { id: created!.id };
  });
}

/** Renames a category: the lines and the items that use it follow. */
export async function updateCategory(categoryId: number, input: { name?: string }) {
  const actor = await asCategoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(category).where(eq(category.id, categoryId)).for("update");
    if (!target) throw notFound("Category");
    if (input.name !== undefined && input.name !== target.name) {
      const [twin] = await tx.select().from(category).where(sameName(category.name, input.name));
      if (twin && twin.id !== categoryId) throw conflict(`"${twin.name}" already exists`);
      await tx.update(category).set({ name: input.name }).where(eq(category.id, categoryId));
      await contracts.emit(lookupRenamed, currentActive(), tx, { kind: "category", from: target.name, to: input.name });
    }
  });
}

export async function deleteCategory(categoryId: number) {
  const actor = await asCategoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(category).where(eq(category.id, categoryId));
    if (!target) throw notFound("Category");
    await refuseIfUsed(tx, "category", { key: String(target.id), name: target.name, id: target.id }, target.name);
    await tx.delete(category).where(eq(category.id, categoryId)); // its fields go with it
  });
}

/** Puts the rows of `table` in the order of `ids`, which must name each of them once. */
async function reorder(tx: Tx, table: typeof category, ids: number[]) {
  const all = await tx.select({ id: table.id }).from(table);
  if (ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((r) => ids.includes(r.id))) {
    throw invalid("The new order must name every entry once");
  }
  for (const [index, id] of ids.entries()) await tx.update(table).set({ position: index + 1 }).where(eq(table.id, id));
}

export async function orderCategories(ids: number[]) {
  const actor = await asCategoryKeeper();
  await runWrite(actor, (tx) => reorder(tx, category, ids));
}

// --- VAT rates -----------------------------------------------------------------------------------

export async function createVatRate(rate: number) {
  const actor = await asAdmin();
  return runWrite(actor, async (tx) => {
    const [twin] = await tx.select().from(vatRate).where(eq(vatRate.rate, rate.toFixed(2)));
    if (twin) throw conflict(`${rate}% is already in the list`);
    const [created] = await tx.insert(vatRate).values({ rate: rate.toFixed(2) }).returning();
    return { id: created!.id };
  });
}

export async function deleteVatRate(rateId: number) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(vatRate).where(eq(vatRate.id, rateId));
    if (!target) throw notFound("VAT rate");
    await refuseIfUsed(tx, "vatRate", { key: String(target.id), name: target.rate }, `${Number(target.rate)}%`);
    await tx.delete(vatRate).where(eq(vatRate.id, rateId));
  });
}

// --- the site ------------------------------------------------------------------------------------

/** Lets the site be changed from a phone, or not (on a phone everybody sees it read-only): admins only. */
export async function updateSite(input: { editOnPhone: boolean }) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    await tx.update(setting).set({ editOnPhone: input.editOnPhone }).where(eq(setting.id, 1));
  });
}
