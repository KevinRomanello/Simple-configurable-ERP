import { asc, eq, max, sql } from "drizzle-orm";
import type { Db } from "../../core/contracts";
import { conflict, invalid, notFound } from "../../core/errors";
import { countRows } from "../../core/usage";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { categoryField, inventoryItem, location, unit } from "../../db/schema/inventory";
import { category } from "../../db/schema/platform";
import { ITEM_FIELDS, type ItemField } from "../../platform/lookups/defaults";
import { assertCanManageInventory } from "./access";

// The lists the inventory is written with (docs/impostazioni.md, docs/inventario.md): the units an item is counted in, the places
// things are kept in, and the optional fields an item of each category shows. They were lists of the core until G5: they are the
// inventory's, kept by the people who keep the inventory, and nobody else uses them. Every change goes into the History.

export type { ItemField } from "../../platform/lookups/defaults";

// --- what the forms read ---------------------------------------------------------------------------

export interface Location {
  /** What is stored with a movement. */
  code: string;
  room: string;
  /** Empty when the place is the room itself. */
  shelf: string;
  /** A level of the shelf; empty when the place is the shelf itself. */
  level: string;
  label: string;
}

/** "Room 1 / Shelf A / 2": the parts a place has, in order. */
export const placeLabel = (place: { room: string; shelf: string; level: string }) =>
  [place.room, place.shelf, place.level].filter((part) => part !== "").join(" / ");

/** Where things can be kept, in their order. The precise spot inside a place ("red box") is free text. */
export async function listLocations(): Promise<Location[]> {
  const rows = await db.select().from(location).orderBy(asc(location.position), asc(location.id));
  return rows.map((r) => ({ code: r.code, room: r.room, shelf: r.shelf, level: r.level, label: placeLabel(r) }));
}

/** How an item is counted. */
export async function listUnits(): Promise<string[]> {
  const rows = await db.select({ name: unit.name }).from(unit).orderBy(asc(unit.id));
  return rows.map((r) => r.name);
}

export interface CategoryFields {
  /** The fields of a category that is not listed (or of an item with no category). */
  fallback: ItemField[];
  byCategory: Record<string, ItemField[]>;
}

/** Which of the optional fields the form shows for each category. None of them is required. */
export async function getCategoryFields(): Promise<CategoryFields> {
  const [categories, rows] = await Promise.all([db.select({ id: category.id, name: category.name }).from(category), db.select().from(categoryField)]);
  const fieldsOf = fieldsReader(rows);
  return { fallback: fieldsOf(null), byCategory: Object.fromEntries(categories.map((c) => [c.name, fieldsOf(c.id)])) };
}

/** The fields of a category (null: of an item without one), always in the order of the form. */
const fieldsReader = (rows: { categoryId: number | null; field: string }[]) => (categoryId: number | null) =>
  ITEM_FIELDS.filter((f) => rows.some((r) => r.categoryId === categoryId && r.field === f)) as ItemField[];

// --- what the Settings page shows ---------------------------------------------------------------------

/** How many items are counted in each unit, by name. */
const unitUse = (reader: Db, names: string[]) => countRows(reader, inventoryItem, inventoryItem.unit, names);

/** How many movements happened at each place or went to it, by code (a movement counts once for a place). */
async function placeUse(reader: Db, codes: string[]): Promise<Map<string, number>> {
  if (codes.length === 0) return new Map();
  const values = sql.join(codes.map((code) => sql`(${code})`), sql`, `);
  const { rows } = await reader.execute<{ code: string; n: number }>(
    sql`select c.code, count(*)::int as n from (values ${values}) as c(code) join stock_movement m on m.location = c.code or m.to_location = c.code group by c.code`,
  );
  return new Map(rows.map((r) => [r.code, r.n]));
}

/** The inventory's part of the Settings page (GET /api/inventory/lists): the fields of each category, the units and the places, with what uses them. */
export async function readLists() {
  await assertCanManageInventory();
  const [fields, units, locations] = await Promise.all([
    db.select().from(categoryField),
    db.select().from(unit).orderBy(asc(unit.id)),
    db.select().from(location).orderBy(asc(location.position), asc(location.id)),
  ]);
  const fieldsOf = fieldsReader(fields);
  const categoryIds = [...new Set(fields.flatMap((f) => (f.categoryId === null ? [] : [f.categoryId])))];
  const [unitsUsed, placesUsed] = await Promise.all([unitUse(db, units.map((u) => u.name)), placeUse(db, locations.map((l) => l.code))]);
  return {
    /** The fields of each category that has some, by category id; a category not there shows none. */
    categoryFields: Object.fromEntries(categoryIds.map((id) => [id, fieldsOf(id)])) as Record<number, ItemField[]>,
    uncategorizedFields: fieldsOf(null),
    units: units.map((u) => ({ id: u.id, name: u.name, usedBy: unitsUsed.get(u.name) ?? 0 })),
    locations: locations.map((l) => ({ id: l.id, code: l.code, room: l.room, shelf: l.shelf, level: l.level, label: placeLabel(l), usedBy: placesUsed.get(l.code) ?? 0 })),
  };
}

// --- the fields of a category ---------------------------------------------------------------------

async function setFields(tx: Tx, categoryId: number | null, fields: ItemField[]) {
  await tx.delete(categoryField).where(categoryId === null ? sql`${categoryField.categoryId} is null` : eq(categoryField.categoryId, categoryId));
  if (fields.length > 0) await tx.insert(categoryField).values([...new Set(fields)].map((field) => ({ categoryId, field })));
}

/** Which optional fields an item of a category shows. */
export async function setCategoryFields(categoryId: number, fields: ItemField[]) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const [found] = await tx.select({ id: category.id }).from(category).where(eq(category.id, categoryId));
    if (!found) throw notFound("Category");
    await setFields(tx, categoryId, fields);
  });
}

/** The fields of an item without a category. */
export async function setUncategorizedFields(fields: ItemField[]) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, (tx) => setFields(tx, null, fields));
}

/** A new category starts with the fields of an item without one (the core tells: `categoryCreated`). */
export async function startCategoryFields(tx: Db, categoryId: number) {
  const fields = (await tx.select().from(categoryField).where(sql`${categoryField.categoryId} is null`)).map((r) => r.field as ItemField);
  if (fields.length > 0) await tx.insert(categoryField).values(fields.map((field) => ({ categoryId, field })));
}

// --- units ---------------------------------------------------------------------------------------

const sameName = (name: string) => sql`lower(${unit.name}) = lower(${name})`;

export async function createUnit(name: string) {
  const actor = await assertCanManageInventory();
  return runWrite(actor, async (tx) => {
    const [twin] = await tx.select().from(unit).where(sameName(name));
    if (twin) throw conflict(`"${twin.name}" is already in the list`);
    const [created] = await tx.insert(unit).values({ name }).returning();
    return { id: created!.id };
  });
}

/** Renames a unit; the items counted in it follow. */
export async function renameUnit(unitId: number, name: string) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(unit).where(eq(unit.id, unitId)).for("update");
    if (!target) throw notFound("Unit");
    const [twin] = await tx.select().from(unit).where(sameName(name));
    if (twin && twin.id !== unitId) throw conflict(`"${twin.name}" is already in the list`);
    await tx.update(unit).set({ name }).where(eq(unit.id, unitId));
    await tx.update(inventoryItem).set({ unit: name }).where(eq(inventoryItem.unit, target.name));
  });
}

export async function deleteUnit(unitId: number) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(unit).where(eq(unit.id, unitId));
    if (!target) throw notFound("Unit");
    const used = (await unitUse(tx, [target.name])).get(target.name) ?? 0;
    if (used > 0) throw conflict(`"${target.name}" is used by ${used} items: it cannot be deleted`);
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
  const actor = await assertCanManageInventory();
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
  const actor = await assertCanManageInventory();
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
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(location).where(eq(location.id, locationId));
    if (!target) throw notFound("Place");
    const used = (await placeUse(tx, [target.code])).get(target.code) ?? 0;
    if (used > 0) throw conflict(`"${placeLabel(target)}" is used by ${used} movements of the inventory: it cannot be deleted`);
    await tx.delete(location).where(eq(location.id, locationId));
  });
}

/** Puts the places in the order of `ids`, which must name each of them once. */
export async function orderLocations(ids: number[]) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const all = await tx.select({ id: location.id }).from(location);
    if (ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((r) => ids.includes(r.id))) {
      throw invalid("The new order must name every entry once");
    }
    for (const [index, id] of ids.entries()) await tx.update(location).set({ position: index + 1 }).where(eq(location.id, id));
  });
}
