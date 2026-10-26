import { asc, count, eq, max, or, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { conflict, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, category, categoryField, fund, inventoryItem, lineFigures, location, setting, stockMovement, unit, vatRate } from "../../db/schema";
import { getCurrentUser, requireAdmin } from "../auth/auth.service";
import { ITEM_FIELDS, type ItemField } from "../lookups/defaults";
import { getSettings } from "../lookups/lookups.service";

// The Settings page: the lists and the switches of the calculation, kept by an admin
// (docs/impostazioni.md). Every change goes into the history (the tables have the audit trigger).

async function asAdmin() {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  return actor;
}

/** How many rows of `table` match `where`. */
async function usage(executor: Pick<typeof db, "select">, table: PgTable, where: SQL | undefined): Promise<number> {
  const [row] = await executor.select({ n: count() }).from(table).where(where);
  return row?.n ?? 0;
}

/** Refuses to take away something that is still used, saying by what. */
function refuseIfUsed(name: string, uses: [number, string][]) {
  const said = uses.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
  if (said.length > 0) throw conflict(`"${name}" is used by ${said.join(" and ")}: it cannot be deleted`);
}

const sameName = (column: typeof category.name | typeof unit.name, name: string) => sql`lower(${column}) = lower(${name})`;

// --- reading -------------------------------------------------------------------------------------

/** Everything the Settings page shows, with how much each entry is used (GET /api/settings). */
export async function readSettings() {
  await asAdmin();
  const [categories, fields, rates, units, locations, calculation] = await Promise.all([
    db.select().from(category).orderBy(asc(category.position), asc(category.id)),
    db.select().from(categoryField),
    db.select().from(vatRate).orderBy(asc(vatRate.rate)),
    db.select().from(unit).orderBy(asc(unit.id)),
    db.select().from(location).orderBy(asc(location.position), asc(location.id)),
    getSettings(),
  ]);
  const fieldsOf = (categoryId: number | null) => ITEM_FIELDS.filter((f) => fields.some((r) => r.categoryId === categoryId && r.field === f));
  return {
    categories: await Promise.all(
      categories.map(async (c) => ({
        id: c.id,
        name: c.name,
        fields: fieldsOf(c.id),
        usedBy: (await usage(db, budgetLine, eq(budgetLine.category, c.name))) + (await usage(db, inventoryItem, eq(inventoryItem.category, c.name))),
      })),
    ),
    uncategorizedFields: fieldsOf(null),
    vatRates: await Promise.all(
      rates.map(async (r) => ({
        id: r.id,
        rate: Number(r.rate),
        usedBy: (await usage(db, fund, eq(fund.vatRate, r.rate))) + (await usage(db, lineFigures, eq(lineFigures.vatRate, r.rate))),
      })),
    ),
    units: await Promise.all(units.map(async (u) => ({ id: u.id, name: u.name, usedBy: await usage(db, inventoryItem, eq(inventoryItem.unit, u.name)) }))),
    locations: await Promise.all(
      locations.map(async (l) => ({
        id: l.id,
        code: l.code,
        site: l.site,
        room: l.room,
        usedBy: await usage(db, stockMovement, or(eq(stockMovement.location, l.code), eq(stockMovement.toLocation, l.code))),
      })),
    ),
    calculation: {
      varianceThreshold: calculation.varianceThreshold,
      vatBaseWhenTotalSponsor: calculation.vatBaseWhenTotalSponsor,
      inflowVatRate: calculation.inflowVatRate,
      bankCompare: calculation.bankCompare,
    },
  };
}

// --- categories ----------------------------------------------------------------------------------

async function setFields(tx: Tx, categoryId: number | null, fields: ItemField[]) {
  await tx.delete(categoryField).where(categoryId === null ? sql`${categoryField.categoryId} is null` : eq(categoryField.categoryId, categoryId));
  if (fields.length > 0) await tx.insert(categoryField).values([...new Set(fields)].map((field) => ({ categoryId, field })));
}

/** A new category, last in the order; without fields it shows the same as an item without a category. */
export async function createCategory(input: { name: string; fields?: ItemField[] }) {
  const actor = await asAdmin();
  return runWrite(actor, async (tx) => {
    const [twin] = await tx.select().from(category).where(sameName(category.name, input.name));
    if (twin) throw conflict(`"${twin.name}" already exists`);
    const [last] = await tx.select({ position: max(category.position) }).from(category);
    const [created] = await tx.insert(category).values({ name: input.name, position: (last?.position ?? 0) + 1 }).returning();
    const fields = input.fields ?? (await tx.select().from(categoryField).where(sql`${categoryField.categoryId} is null`)).map((r) => r.field as ItemField);
    await setFields(tx, created!.id, fields);
    return { id: created!.id };
  });
}

/** Renames a category (the lines and the items that use it follow) and/or sets which fields it shows. */
export async function updateCategory(categoryId: number, input: { name?: string; fields?: ItemField[] }) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(category).where(eq(category.id, categoryId)).for("update");
    if (!target) throw notFound("Category");
    if (input.name !== undefined && input.name !== target.name) {
      const [twin] = await tx.select().from(category).where(sameName(category.name, input.name));
      if (twin && twin.id !== categoryId) throw conflict(`"${twin.name}" already exists`);
      await tx.update(category).set({ name: input.name }).where(eq(category.id, categoryId));
      await tx.update(budgetLine).set({ category: input.name }).where(eq(budgetLine.category, target.name));
      await tx.update(inventoryItem).set({ category: input.name }).where(eq(inventoryItem.category, target.name));
    }
    if (input.fields !== undefined) await setFields(tx, categoryId, input.fields);
  });
}

export async function deleteCategory(categoryId: number) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(category).where(eq(category.id, categoryId));
    if (!target) throw notFound("Category");
    refuseIfUsed(target.name, [
      [await usage(tx, budgetLine, eq(budgetLine.category, target.name)), "budget lines"],
      [await usage(tx, inventoryItem, eq(inventoryItem.category, target.name)), "items"],
    ]);
    await tx.delete(category).where(eq(category.id, categoryId)); // its fields go with it
  });
}

/** The fields of an item without a category. */
export async function setUncategorizedFields(fields: ItemField[]) {
  const actor = await asAdmin();
  await runWrite(actor, (tx) => setFields(tx, null, fields));
}

/** Puts the rows of `table` in the order of `ids`, which must name each of them once. */
async function reorder(tx: Tx, table: typeof category | typeof location, ids: number[]) {
  const all = await tx.select({ id: table.id }).from(table);
  if (ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((r) => ids.includes(r.id))) {
    throw invalid("The new order must name every entry once");
  }
  for (const [index, id] of ids.entries()) await tx.update(table).set({ position: index + 1 }).where(eq(table.id, id));
}

export async function orderCategories(ids: number[]) {
  const actor = await asAdmin();
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
    refuseIfUsed(`${Number(target.rate)}%`, [
      [await usage(tx, fund, eq(fund.vatRate, target.rate)), "sponsors"],
      [await usage(tx, lineFigures, eq(lineFigures.vatRate, target.rate)), "budget lines"],
    ]);
    await tx.delete(vatRate).where(eq(vatRate.id, rateId));
  });
}

// --- units ---------------------------------------------------------------------------------------

export async function createUnit(name: string) {
  const actor = await asAdmin();
  return runWrite(actor, async (tx) => {
    const [twin] = await tx.select().from(unit).where(sameName(unit.name, name));
    if (twin) throw conflict(`"${twin.name}" is already in the list`);
    const [created] = await tx.insert(unit).values({ name }).returning();
    return { id: created!.id };
  });
}

/** Renames a unit; the items counted in it follow. */
export async function renameUnit(unitId: number, name: string) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(unit).where(eq(unit.id, unitId)).for("update");
    if (!target) throw notFound("Unit");
    const [twin] = await tx.select().from(unit).where(sameName(unit.name, name));
    if (twin && twin.id !== unitId) throw conflict(`"${twin.name}" is already in the list`);
    await tx.update(unit).set({ name }).where(eq(unit.id, unitId));
    await tx.update(inventoryItem).set({ unit: name }).where(eq(inventoryItem.unit, target.name));
  });
}

export async function deleteUnit(unitId: number) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(unit).where(eq(unit.id, unitId));
    if (!target) throw notFound("Unit");
    refuseIfUsed(target.name, [[await usage(tx, inventoryItem, eq(inventoryItem.unit, target.name)), "items"]]);
    await tx.delete(unit).where(eq(unit.id, unitId));
  });
}

// --- places --------------------------------------------------------------------------------------

const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";

/** A new place, last in the order. Its code (what the movements store) is made from its names and never changes. */
export async function createLocation(input: { site: string; room: string }) {
  const actor = await asAdmin();
  return runWrite(actor, async (tx) => {
    const [twin] = await tx.select().from(location).where(sql`lower(${location.site}) = lower(${input.site}) and lower(${location.room}) = lower(${input.room})`);
    if (twin) throw conflict(`"${twin.site} / ${twin.room}" already exists`);
    const base = `${slug(input.site)}--${slug(input.room)}`;
    const taken = new Set((await tx.select({ code: location.code }).from(location)).map((r) => r.code));
    let code = base;
    for (let n = 2; taken.has(code); n += 1) code = `${base}-${n}`;
    const [last] = await tx.select({ position: max(location.position) }).from(location);
    const [created] = await tx.insert(location).values({ code, site: input.site, room: input.room, position: (last?.position ?? 0) + 1 }).returning();
    return { id: created!.id, code };
  });
}

/** Renames the site or the room of a place; its code stays, so the movements stay right. */
export async function updateLocation(locationId: number, input: { site?: string; room?: string }) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(location).where(eq(location.id, locationId)).for("update");
    if (!target) throw notFound("Place");
    const site = input.site ?? target.site;
    const room = input.room ?? target.room;
    const [twin] = await tx.select().from(location).where(sql`lower(${location.site}) = lower(${site}) and lower(${location.room}) = lower(${room})`);
    if (twin && twin.id !== locationId) throw conflict(`"${twin.site} / ${twin.room}" already exists`);
    await tx.update(location).set({ site, room }).where(eq(location.id, locationId));
  });
}

export async function deleteLocation(locationId: number) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(location).where(eq(location.id, locationId));
    if (!target) throw notFound("Place");
    refuseIfUsed(`${target.site} / ${target.room}`, [
      [await usage(tx, stockMovement, or(eq(stockMovement.location, target.code), eq(stockMovement.toLocation, target.code))), "movements of the inventory"],
    ]);
    await tx.delete(location).where(eq(location.id, locationId));
  });
}

export async function orderLocations(ids: number[]) {
  const actor = await asAdmin();
  await runWrite(actor, (tx) => reorder(tx, location, ids));
}

// --- the switches of the calculation ------------------------------------------------------------

export interface CalculationInput {
  varianceThreshold?: number;
  vatBaseWhenTotalSponsor?: "net" | "net-minus-sponsor";
  inflowVatRate?: number;
  bankCompare?: { summary?: "day" | "month"; timeline?: "day" | "month" };
}

/** Changes the switches of the calculation; what is left out stays as it is. Every page uses them at once. */
export async function updateCalculation(input: CalculationInput) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    await tx
      .update(setting)
      .set({
        ...(input.varianceThreshold !== undefined ? { varianceThreshold: input.varianceThreshold.toFixed(4) } : {}),
        ...(input.vatBaseWhenTotalSponsor !== undefined ? { vatBaseWhenTotalSponsor: input.vatBaseWhenTotalSponsor } : {}),
        ...(input.inflowVatRate !== undefined ? { inflowVatRate: input.inflowVatRate.toFixed(2) } : {}),
        ...(input.bankCompare?.summary !== undefined ? { bankCompareSummary: input.bankCompare.summary } : {}),
        ...(input.bankCompare?.timeline !== undefined ? { bankCompareTimeline: input.bankCompare.timeline } : {}),
      })
      .where(eq(setting.id, 1));
  });
}

