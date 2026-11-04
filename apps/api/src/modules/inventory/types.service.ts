import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { area, inventoryItem, itemParamValue, itemType, itemTypeParam } from "../../db/schema";
import { canManageInventory, getCurrentUser } from "../auth/auth.service";
import { paramNumber, type CreateParamInput, type ParamFilter, type UpdateParamInput } from "./inventory.schema";

// The types of the inventory (Resistor, Screw…) and their parameters, kept on the Settings page by
// those who keep the inventory, and what is written in them for each item. docs/inventario.md, §19.

type Reader = Pick<typeof db, "select">;
type Param = typeof itemTypeParam.$inferSelect;
type Kind = Param["kind"];

async function asManager() {
  const actor = await getCurrentUser();
  if (!(await canManageInventory(actor))) throw forbidden("You cannot change the inventory");
  return actor;
}

const count0 = (rows: { n: number }[]) => rows[0]?.n ?? 0;

// --- reading -------------------------------------------------------------------------------------

export interface TypeView {
  id: number;
  name: string;
  areaId: number | null;
  hazards: boolean;
  /** How many items are of this type. */
  items: number;
  /** In their order, each with how many items have something written in it. */
  params: (Param & { filledIn: number })[];
}

/** Every type with its parameters (GET /api/inventory/types: everybody may read them). */
export async function listTypes(): Promise<TypeView[]> {
  const [types, params, items, values] = await Promise.all([
    db.select().from(itemType).orderBy(sql`lower(${itemType.name})`),
    db.select().from(itemTypeParam).orderBy(asc(itemTypeParam.position), asc(itemTypeParam.id)),
    db.select({ typeId: inventoryItem.typeId, n: count() }).from(inventoryItem).groupBy(inventoryItem.typeId),
    db.select({ paramId: itemParamValue.paramId, n: count() }).from(itemParamValue).groupBy(itemParamValue.paramId),
  ]);
  const itemsOf = new Map(items.map((r) => [r.typeId, r.n]));
  const filled = new Map(values.map((r) => [r.paramId, r.n]));
  return types.map((t) => ({
    ...t,
    items: itemsOf.get(t.id) ?? 0,
    params: params.filter((p) => p.typeId === t.id).map((p) => ({ ...p, filledIn: filled.get(p.id) ?? 0 })),
  }));
}

// --- types ---------------------------------------------------------------------------------------

/** Refuses an area or a type that does not exist (the items take both). */
export async function checkAreaAndType(reader: Reader, input: { areaId?: number | null; typeId?: number | null }) {
  if (input.areaId != null && (await reader.select({ id: area.id }).from(area).where(eq(area.id, input.areaId))).length === 0) {
    throw invalid(`Unknown area ${input.areaId}`);
  }
  if (input.typeId != null && (await reader.select({ id: itemType.id }).from(itemType).where(eq(itemType.id, input.typeId))).length === 0) {
    throw invalid(`Unknown type ${input.typeId}`);
  }
}

async function refuseTwinType(tx: Tx, name: string, exceptId?: number) {
  const [twin] = await tx.select().from(itemType).where(sql`lower(${itemType.name}) = lower(${name})`);
  if (twin && twin.id !== exceptId) throw conflict(`There is already a type "${twin.name}"`);
}

export async function createType(input: { name: string; areaId: number | null; hazards: boolean }) {
  const actor = await asManager();
  return runWrite(actor, async (tx) => {
    await checkAreaAndType(tx, input);
    await refuseTwinType(tx, input.name);
    const [created] = await tx.insert(itemType).values(input).returning();
    return created!;
  });
}

export async function updateType(typeId: number, input: { name?: string; areaId?: number | null; hazards?: boolean }) {
  const actor = await asManager();
  return runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(itemType).where(eq(itemType.id, typeId)).for("update");
    if (!target) throw notFound("Type");
    await checkAreaAndType(tx, input);
    if (input.name !== undefined) await refuseTwinType(tx, input.name, typeId);
    if (Object.keys(input).length === 0) return target;
    const [updated] = await tx.update(itemType).set(input).where(eq(itemType.id, typeId)).returning();
    return updated!;
  });
}

/** Deletes a type no item is of; its parameters go with it. */
export async function deleteType(typeId: number) {
  const actor = await asManager();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(itemType).where(eq(itemType.id, typeId)).for("update");
    if (!target) throw notFound("Type");
    const items = count0(await tx.select({ n: count() }).from(inventoryItem).where(eq(inventoryItem.typeId, typeId)));
    if (items > 0) throw conflict(`"${target.name}" is the type of ${items} items: give them another type first`);
    await tx.delete(itemType).where(eq(itemType.id, typeId));
  });
}

// --- parameters ----------------------------------------------------------------------------------

/** What a parameter of each kind may have: a unit and prefixes for a number, choices for a list (added one by one: it may start empty). */
function checkShape(kind: Kind, unit: string | null, prefixes: boolean, choices: string[]) {
  if (kind !== "number" && (unit !== null || prefixes)) throw invalid("Only a number has a unit and prefixes");
  if (kind !== "list" && choices.length > 0) throw invalid("Only a list has choices");
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) throw invalid("The same choice is written twice");
}

async function refuseTwinParam(tx: Tx, typeId: number, name: string, exceptId?: number) {
  const [twin] = await tx
    .select()
    .from(itemTypeParam)
    .where(and(eq(itemTypeParam.typeId, typeId), sql`lower(${itemTypeParam.name}) = lower(${name})`));
  if (twin && twin.id !== exceptId) throw conflict(`The type already has "${twin.name}"`);
}

const filledIn = async (tx: Tx, paramId: number, where = sql`true`) =>
  count0(await tx.select({ n: count() }).from(itemParamValue).where(and(eq(itemParamValue.paramId, paramId), where)));

/** A new parameter, last of its type. */
export async function addParam(typeId: number, input: CreateParamInput) {
  const actor = await asManager();
  return runWrite(actor, async (tx) => {
    // the type is locked: two parameters added at once take two positions
    const [type] = await tx.select().from(itemType).where(eq(itemType.id, typeId)).for("update");
    if (!type) throw notFound("Type");
    checkShape(input.kind, input.unit, input.prefixes, input.choices);
    await refuseTwinParam(tx, typeId, input.name);
    const [last] = await tx.select({ position: max(itemTypeParam.position) }).from(itemTypeParam).where(eq(itemTypeParam.typeId, typeId));
    const [created] = await tx.insert(itemTypeParam).values({ ...input, typeId, position: (last?.position ?? 0) + 1 }).returning();
    return created!;
  });
}

/**
 * Changes a parameter. The kind changes only while nothing is written in it. A choice of a list
 * that items have cannot be taken away, but it can be renamed (`was`): the items follow.
 */
export async function updateParam(paramId: number, input: UpdateParamInput) {
  const actor = await asManager();
  return runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(itemTypeParam).where(eq(itemTypeParam.id, paramId)).for("update");
    if (!target) throw notFound("Parameter");
    const kind = input.kind ?? target.kind;
    const kindChanged = kind !== target.kind;
    if (kindChanged) {
      const written = await filledIn(tx, paramId);
      if (written > 0) throw conflict(`"${target.name}" is filled in for ${written} items: its kind cannot change`);
    }
    // a new kind starts without what belonged to the old one, unless it is given
    const unit = input.unit !== undefined ? input.unit : kindChanged ? null : target.unit;
    const prefixes = input.prefixes ?? (kindChanged ? false : target.prefixes);
    const choices = input.choices === undefined ? (kindChanged ? [] : target.choices) : input.choices.map((c) => c.name);
    checkShape(kind, unit, prefixes, choices);
    if (input.name !== undefined) await refuseTwinParam(tx, target.typeId, input.name, paramId);
    if (input.choices !== undefined) await changeChoices(tx, target, input.choices);
    const [updated] = await tx
      .update(itemTypeParam)
      .set({ name: input.name ?? target.name, kind, unit, prefixes, choices })
      .where(eq(itemTypeParam.id, paramId))
      .returning();
    return updated!;
  });
}

/** Renames the choices that items have (all at once: A→B and B→A swap them) and refuses to take away one in use. */
async function changeChoices(tx: Tx, param: Param, next: { was?: string; name: string }[]) {
  const was = next.flatMap((c) => (c.was === undefined ? [] : [c.was]));
  if (new Set(was).size !== was.length) throw invalid("A choice can become only one choice");
  const unknown = was.find((w) => !param.choices.includes(w));
  if (unknown !== undefined) throw invalid(`"${unknown}" is not a choice of ${param.name}`);
  for (const gone of param.choices.filter((c) => !was.includes(c))) {
    const users = await filledIn(tx, param.id, eq(itemParamValue.text, gone));
    if (users > 0) throw conflict(`${users} items have "${gone}": give them another choice first, or rename it`);
  }
  const renamed = next.filter((c): c is { was: string; name: string } => c.was !== undefined && c.was !== c.name);
  if (renamed.length === 0) return;
  const cases = sql.join(renamed.map((r) => sql`when ${itemParamValue.text} = ${r.was} then ${r.name}`), sql` `);
  await tx
    .update(itemParamValue)
    .set({ text: sql`case ${cases} else ${itemParamValue.text} end` })
    .where(and(eq(itemParamValue.paramId, param.id), inArray(itemParamValue.text, renamed.map((r) => r.was))));
}

/** Deletes a parameter and what was written in it (the history keeps it). */
export async function deleteParam(paramId: number) {
  const actor = await asManager();
  await runWrite(actor, async (tx) => {
    const [deleted] = await tx.delete(itemTypeParam).where(eq(itemTypeParam.id, paramId)).returning();
    if (!deleted) throw notFound("Parameter");
  });
}

/** Puts the parameters of a type in the order of `ids`, which must name each of them once. */
export async function orderParams(typeId: number, ids: number[]) {
  const actor = await asManager();
  await runWrite(actor, async (tx) => {
    const [type] = await tx.select().from(itemType).where(eq(itemType.id, typeId)).for("update");
    if (!type) throw notFound("Type");
    const all = await tx.select({ id: itemTypeParam.id }).from(itemTypeParam).where(eq(itemTypeParam.typeId, typeId));
    if (ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((r) => ids.includes(r.id))) {
      throw invalid("The new order must name every parameter of the type once");
    }
    for (const [index, id] of ids.entries()) await tx.update(itemTypeParam).set({ position: index + 1 }).where(eq(itemTypeParam.id, id));
  });
}

// --- what is written about an item ---------------------------------------------------------------

/** What is written in the parameters of an item, by parameter: a number as a decimal string in its unit, a text, yes or no. */
export type ParamValues = Record<number, string | boolean>;

/** "007.50" → "7.5", "-0" → "0": one way of writing each number, so that a value written again is the same. */
export function canonicalNumber(value: string): string {
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const text = [whole.replace(/^0+(?=\d)/, ""), fraction.replace(/0+$/, "")].filter((part) => part !== "").join(".");
  return value.startsWith("-") && text !== "0" ? `-${text}` : text;
}

interface Stored {
  number: string | null;
  text: string | null;
  flag: boolean | null;
}

/** The columns a value goes in, checked against the kind of its parameter. */
function stored(param: Param, value: string | boolean): Stored {
  const none: Stored = { number: null, text: null, flag: null };
  if (param.kind === "yesno") {
    if (typeof value !== "boolean") throw invalid(`${param.name}: yes or no (true or false)`);
    return { ...none, flag: value };
  }
  if (typeof value !== "string") throw invalid(`${param.name}: expected a text`);
  if (param.kind === "number") {
    if (!paramNumber.safeParse(value).success) throw invalid(`${param.name}: "${value}" is not a number`);
    return { ...none, number: canonicalNumber(value) };
  }
  if (param.kind === "list" && !param.choices.includes(value)) {
    throw invalid(`${param.name}: "${value}" is not one of its choices (${param.choices.join(", ")})`);
  }
  return { ...none, text: value };
}

/**
 * Writes what is given about an item, for the parameters of its type: null (or an empty text)
 * clears one. A parameter that is not given keeps what it had; one that does not change is not
 * written again (so the history shows only real changes).
 */
export async function writeValues(tx: Tx, itemId: number, typeId: number | null, values: { paramId: number; value: string | boolean | null }[]) {
  if (values.length === 0) return;
  if (typeId === null) throw invalid("An item without a type has no parameters");
  // shared lock: a parameter cannot be deleted or changed while it is being written
  const params = await tx.select().from(itemTypeParam).where(eq(itemTypeParam.typeId, typeId)).for("share");
  const before = await tx.select().from(itemParamValue).where(eq(itemParamValue.itemId, itemId));
  for (const { paramId, value } of values) {
    const param = params.find((p) => p.id === paramId);
    if (!param) throw invalid(`Parameter ${paramId} is not one of the type of this item`);
    const old = before.find((v) => v.paramId === paramId);
    if (value === null || value === "") {
      if (old) await tx.delete(itemParamValue).where(eq(itemParamValue.id, old.id));
      continue;
    }
    const next = stored(param, value);
    if (!old) await tx.insert(itemParamValue).values({ itemId, paramId, ...next });
    else if (old.number !== next.number || old.text !== next.text || old.flag !== next.flag) {
      await tx.update(itemParamValue).set(next).where(eq(itemParamValue.id, old.id));
    }
  }
}

/** What is written about each item for the parameters of its type (the values kept from a type it had before are left out). */
export async function valuesByItem(reader: Reader = db, itemId?: number): Promise<Map<number, ParamValues>> {
  const rows = await reader
    .select({ itemId: itemParamValue.itemId, paramId: itemParamValue.paramId, number: itemParamValue.number, text: itemParamValue.text, flag: itemParamValue.flag })
    .from(itemParamValue)
    .innerJoin(itemTypeParam, eq(itemTypeParam.id, itemParamValue.paramId))
    .innerJoin(inventoryItem, and(eq(inventoryItem.id, itemParamValue.itemId), eq(inventoryItem.typeId, itemTypeParam.typeId)))
    .where(itemId === undefined ? undefined : eq(itemParamValue.itemId, itemId));
  const byItem = new Map<number, ParamValues>();
  for (const r of rows) {
    const values = byItem.get(r.itemId) ?? {};
    values[r.paramId] = r.number ?? r.text ?? r.flag ?? false;
    byItem.set(r.itemId, values);
  }
  return byItem;
}

/** `%` and `_` are ordinary characters in what the person searches for. */
const likeText = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * The items that pass every filter on parameters (null: no such filter). Compared in the database,
 * where the numbers are exact: "at least 100n" keeps 100 nF.
 */
export async function itemsMatching(filters: ParamFilter[]): Promise<Set<number> | null> {
  if (filters.length === 0) return null;
  const params = await db.select().from(itemTypeParam).where(inArray(itemTypeParam.id, filters.map((f) => f.paramId)));
  const found: Set<number>[] = [];
  for (const filter of filters) {
    const param = params.find((p) => p.id === filter.paramId);
    if (!param) throw invalid(`Unknown parameter ${filter.paramId}`);
    found.push(new Set(await matchingOne(param, filter)));
  }
  return found.reduce((all, one) => new Set([...all].filter((itemId) => one.has(itemId))));
}

async function matchingOne(param: Param, filter: ParamFilter): Promise<number[]> {
  const ofType = eq(inventoryItem.typeId, param.typeId);
  if (param.kind === "yesno") {
    if (filter.op !== "is" || !["yes", "no"].includes(filter.value)) throw invalid(`${param.name}: filter with yes or no`);
    const yes = sql`exists (select 1 from ${itemParamValue} where ${itemParamValue.itemId} = ${inventoryItem.id} and ${itemParamValue.paramId} = ${param.id} and ${itemParamValue.flag})`;
    // "no" is every item of the type that is not marked yes (also those where nothing is written)
    const rows = await db.select({ id: inventoryItem.id }).from(inventoryItem).where(and(ofType, filter.value === "yes" ? yes : sql`not ${yes}`));
    return rows.map((r) => r.id);
  }
  if (param.kind !== "number" && filter.op !== "is") throw invalid(`${param.name}: only a number has a range`);
  if (param.kind === "number" && !paramNumber.safeParse(filter.value).success) throw invalid(`${param.name}: "${filter.value}" is not a number`);
  const column = itemParamValue.number;
  const condition =
    param.kind === "number"
      ? filter.op === "min" ? sql`${column} >= ${filter.value}::numeric` : filter.op === "max" ? sql`${column} <= ${filter.value}::numeric` : sql`${column} = ${filter.value}::numeric`
      : param.kind === "list" ? eq(itemParamValue.text, filter.value) : sql`${itemParamValue.text} ilike ${likeText(filter.value)}`;
  const rows = await db
    .select({ id: itemParamValue.itemId })
    .from(itemParamValue)
    .innerJoin(inventoryItem, eq(inventoryItem.id, itemParamValue.itemId))
    .where(and(eq(itemParamValue.paramId, param.id), ofType, condition));
  return rows.map((r) => r.id);
}
