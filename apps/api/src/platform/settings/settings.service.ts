import { asc, eq, max, sql } from "drizzle-orm";
import { contracts, type Db } from "../../core/contracts";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { categoryField, location, unit } from "../../db/schema/inventory";
import { category, setting, vatRate } from "../../db/schema/platform";
import { canManageInventory, getCurrentUser, requireAdmin } from "../auth/auth.service";
import { ITEM_FIELDS, type ItemField } from "../lookups/defaults";
import { getSettings, placeLabel } from "../lookups/lookups.service";
import { currentActive, lookupRenamed, totalUse, usageOf, type UsageKind, type UsageRow, type UsageSubject } from "../platform.public";

// The Settings page (docs/impostazioni.md). The switches of the calculation, the VAT rates and the
// seasons are the admin's; the lists the inventory is written with (categories, units, places) are also
// kept by the project managers, who need them to use the inventory. Every change goes into the history
// (the tables have the audit trigger).

async function asAdmin() {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  return actor;
}

/** The lists of the inventory: the admins and the project managers (the people who keep the inventory). */
async function asInventoryKeeper() {
  const actor = await getCurrentUser();
  if (!(await canManageInventory(actor))) throw forbidden("Only an admin or a user can change this list");
  return actor;
}

/** Refuses to take away something that is still used, saying by what (the modules that are on say what uses it). */
async function refuseIfUsed(executor: Db, kind: UsageKind, subject: UsageSubject, said: string) {
  const uses: UsageRow[] = (await usageOf(executor, kind, [subject])).get(subject.key) ?? [];
  if (uses.length > 0) throw conflict(`"${said}" is used by ${uses.map((u) => `${u.count} ${u.label}`).join(" and ")}: it cannot be deleted`);
}

const sameName = (column: typeof category.name | typeof unit.name, name: string) => sql`lower(${column}) = lower(${name})`;

// --- reading -------------------------------------------------------------------------------------

/** Everything the Settings page shows, with how much each entry is used (GET /api/settings). */
export async function readSettings() {
  await asInventoryKeeper();
  const [categories, fields, rates, units, locations, calculation] = await Promise.all([
    db.select().from(category).orderBy(asc(category.position), asc(category.id)),
    db.select().from(categoryField),
    db.select().from(vatRate).orderBy(asc(vatRate.rate)),
    db.select().from(unit).orderBy(asc(unit.id)),
    db.select().from(location).orderBy(asc(location.position), asc(location.id)),
    getSettings(),
  ]);
  const fieldsOf = (categoryId: number | null) => ITEM_FIELDS.filter((f) => fields.some((r) => r.categoryId === categoryId && r.field === f));
  // who uses each entry: one question per list, answered by the modules that are on
  const [categoryUse, rateUse, unitUse, placeUse] = await Promise.all([
    usageOf(db, "category", categories.map((c) => ({ key: String(c.id), name: c.name, id: c.id }))),
    usageOf(db, "vatRate", rates.map((r) => ({ key: String(r.id), name: r.rate }))),
    usageOf(db, "unit", units.map((u) => ({ key: String(u.id), name: u.name }))),
    usageOf(db, "location", locations.map((l) => ({ key: String(l.id), name: l.code }))),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, fields: fieldsOf(c.id), usedBy: totalUse(categoryUse.get(String(c.id))) })),
    uncategorizedFields: fieldsOf(null),
    vatRates: rates.map((r) => ({ id: r.id, rate: Number(r.rate), usedBy: totalUse(rateUse.get(String(r.id))) })),
    units: units.map((u) => ({ id: u.id, name: u.name, usedBy: totalUse(unitUse.get(String(u.id))) })),
    locations: locations.map((l) => ({ id: l.id, code: l.code, room: l.room, shelf: l.shelf, level: l.level, label: placeLabel(l), usedBy: totalUse(placeUse.get(String(l.id))) })),
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
  const actor = await asInventoryKeeper();
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
  const actor = await asInventoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(category).where(eq(category.id, categoryId)).for("update");
    if (!target) throw notFound("Category");
    if (input.name !== undefined && input.name !== target.name) {
      const [twin] = await tx.select().from(category).where(sameName(category.name, input.name));
      if (twin && twin.id !== categoryId) throw conflict(`"${twin.name}" already exists`);
      await tx.update(category).set({ name: input.name }).where(eq(category.id, categoryId));
      await contracts.emit(lookupRenamed, currentActive(), tx, { kind: "category", from: target.name, to: input.name });
    }
    if (input.fields !== undefined) await setFields(tx, categoryId, input.fields);
  });
}

export async function deleteCategory(categoryId: number) {
  const actor = await asInventoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(category).where(eq(category.id, categoryId));
    if (!target) throw notFound("Category");
    await refuseIfUsed(tx, "category", { key: String(target.id), name: target.name, id: target.id }, target.name);
    await tx.delete(category).where(eq(category.id, categoryId)); // its fields go with it
  });
}

/** The fields of an item without a category. */
export async function setUncategorizedFields(fields: ItemField[]) {
  const actor = await asInventoryKeeper();
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
  const actor = await asInventoryKeeper();
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

// --- units ---------------------------------------------------------------------------------------

export async function createUnit(name: string) {
  const actor = await asInventoryKeeper();
  return runWrite(actor, async (tx) => {
    const [twin] = await tx.select().from(unit).where(sameName(unit.name, name));
    if (twin) throw conflict(`"${twin.name}" is already in the list`);
    const [created] = await tx.insert(unit).values({ name }).returning();
    return { id: created!.id };
  });
}

/** Renames a unit; the items counted in it follow. */
export async function renameUnit(unitId: number, name: string) {
  const actor = await asInventoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(unit).where(eq(unit.id, unitId)).for("update");
    if (!target) throw notFound("Unit");
    const [twin] = await tx.select().from(unit).where(sameName(unit.name, name));
    if (twin && twin.id !== unitId) throw conflict(`"${twin.name}" is already in the list`);
    await tx.update(unit).set({ name }).where(eq(unit.id, unitId));
    await contracts.emit(lookupRenamed, currentActive(), tx, { kind: "unit", from: target.name, to: name });
  });
}

export async function deleteUnit(unitId: number) {
  const actor = await asInventoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(unit).where(eq(unit.id, unitId));
    if (!target) throw notFound("Unit");
    await refuseIfUsed(tx, "unit", { key: String(target.id), name: target.name }, target.name);
    await tx.delete(unit).where(eq(unit.id, unitId));
  });
}

// --- places --------------------------------------------------------------------------------------

const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";

type Place = { room: string; shelf: string; level: string };

/** A level is a level of a shelf: it cannot be there without one. */
function assertPlace(place: Place) {
  if (place.level !== "" && place.shelf === "") throw invalid("A level needs a shelf");
}

const samePlace = (p: Place) =>
  sql`lower(${location.room}) = lower(${p.room}) and lower(${location.shelf}) = lower(${p.shelf}) and lower(${location.level}) = lower(${p.level})`;

/** One new place, last in the order. Its code (what the movements store) is made from its names and never changes. */
async function insertPlace(tx: Tx, place: Place) {
  const [twin] = await tx.select().from(location).where(samePlace(place));
  if (twin) throw conflict(`"${placeLabel(twin)}" already exists`);
  const base = [place.room, place.shelf, place.level].filter((part) => part !== "").map(slug).join("--");
  const taken = new Set((await tx.select({ code: location.code }).from(location)).map((r) => r.code));
  let code = base;
  for (let n = 2; taken.has(code); n += 1) code = `${base}-${n}`;
  const [last] = await tx.select({ position: max(location.position) }).from(location);
  const [created] = await tx.insert(location).values({ code, ...place, position: (last?.position ?? 0) + 1 }).returning();
  return { id: created!.id, code };
}

/**
 * New places: a room, optionally with a shelf, optionally with one place for each level named (so a shelf with four levels is
 * one request). All or none: a name that is already there stops the lot. The result is the first place and how many were made.
 */
export async function createLocation(input: { room: string; shelf?: string; levels?: string[] }) {
  const actor = await asInventoryKeeper();
  const shelf = input.shelf ?? "";
  const levels = input.levels?.length ? input.levels : [""];
  levels.forEach((level) => assertPlace({ room: input.room, shelf, level }));
  return runWrite(actor, async (tx) => {
    const made = [];
    for (const level of levels) made.push(await insertPlace(tx, { room: input.room, shelf, level }));
    return { ...made[0]!, created: made.length };
  });
}

/** Renames the room, the shelf or the level of a place; its code stays, so the movements stay right. */
export async function updateLocation(locationId: number, input: { room?: string; shelf?: string; level?: string }) {
  const actor = await asInventoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(location).where(eq(location.id, locationId)).for("update");
    if (!target) throw notFound("Place");
    const place = { room: input.room ?? target.room, shelf: input.shelf ?? target.shelf, level: input.level ?? target.level };
    assertPlace(place);
    const [twin] = await tx.select().from(location).where(samePlace(place));
    if (twin && twin.id !== locationId) throw conflict(`"${placeLabel(twin)}" already exists`);
    await tx.update(location).set(place).where(eq(location.id, locationId));
  });
}

export async function deleteLocation(locationId: number) {
  const actor = await asInventoryKeeper();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(location).where(eq(location.id, locationId));
    if (!target) throw notFound("Place");
    await refuseIfUsed(tx, "location", { key: String(target.id), name: target.code }, placeLabel(target));
    await tx.delete(location).where(eq(location.id, locationId));
  });
}

export async function orderLocations(ids: number[]) {
  const actor = await asInventoryKeeper();
  await runWrite(actor, (tx) => reorder(tx, location, ids));
}

// --- the switches of the calculation ------------------------------------------------------------

export interface CalculationInput {
  varianceThreshold?: number;
  vatBaseWhenTotalSponsor?: "net" | "net-minus-sponsor";
  inflowVatRate?: number;
  bankCompare?: { summary?: "day" | "month"; timeline?: "day" | "month" };
}

/** Lets the site be changed from a phone, or not (on a phone everybody sees it read-only): admins only. */
export async function updateSite(input: { editOnPhone: boolean }) {
  const actor = await asAdmin();
  await runWrite(actor, async (tx) => {
    await tx.update(setting).set({ editOnPhone: input.editOnPhone }).where(eq(setting.id, 1));
  });
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

