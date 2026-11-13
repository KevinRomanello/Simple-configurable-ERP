import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { area, category, inventoryItem, itemParamValue, itemType, itemTypeParam } from "../../db/schema";
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

// --- the tree --------------------------------------------------------------------------------------
// A type can be a kind of another (IC > Op-amp) and has the parameters of all its parents. The types are few, so the tree is
// read whole and walked here.

type TypeRow = typeof itemType.$inferSelect;

async function typeRows(reader: Reader): Promise<Map<number, TypeRow>> {
  return new Map((await reader.select().from(itemType)).map((t) => [t.id, t]));
}

/** The types from the root down to this one, which is last. */
function chainOf(types: Map<number, TypeRow>, typeId: number): TypeRow[] {
  const chain: TypeRow[] = [];
  for (let t = types.get(typeId); t && !chain.includes(t); t = t.parentId === null ? undefined : types.get(t.parentId)) chain.unshift(t);
  return chain;
}

/** The type and every type under it, at any depth. */
export function subtreeOf(types: Map<number, Pick<TypeRow, "id" | "parentId">>, typeId: number): number[] {
  const found = [typeId];
  for (let i = 0; i < found.length; i += 1) for (const t of types.values()) if (t.parentId === found[i] && !found.includes(t.id)) found.push(t.id);
  return found;
}

/** The ids of a type and of the types under it: an item of any of them is "of" the type. */
export async function subtreeIds(reader: Reader, typeId: number): Promise<number[]> {
  return subtreeOf(await typeRows(reader), typeId);
}

// --- reading -------------------------------------------------------------------------------------

export interface TypeView {
  id: number;
  name: string;
  /** The type this one is a kind of; null for one that is not under another. */
  parentId: number | null;
  /** How many types it is under: 0 for a root. */
  depth: number;
  /** "IC › Op-amp": the names from the root. */
  path: string;
  areaId: number | null;
  hazards: boolean;
  /** The category of the budget its items belong to (they take it from here); null for a type made before this was asked. */
  categoryId: number | null;
  category: string | null;
  /** How many items are of this type. */
  items: number;
  /**
   * What is written about its items, in the order of the tree: the parameters of its parents first, then its own. Each says
   * how many items have something written in it, and whether it comes from a parent (`inherited`; `typeId` is where it is).
   */
  params: (Param & { filledIn: number; inherited: boolean })[];
}

/** Every type with its parameters, in the order of the tree: a type, then the types under it (GET /api/inventory/types: everybody may read them). */
export async function listTypes(): Promise<TypeView[]> {
  const [rows, params, items, values, categories] = await Promise.all([
    db.select().from(itemType),
    db.select().from(itemTypeParam).orderBy(asc(itemTypeParam.position), asc(itemTypeParam.id)),
    db.select({ typeId: inventoryItem.typeId, n: count() }).from(inventoryItem).groupBy(inventoryItem.typeId),
    db.select({ paramId: itemParamValue.paramId, n: count() }).from(itemParamValue).groupBy(itemParamValue.paramId),
    db.select({ id: category.id, name: category.name }).from(category),
  ]);
  const byId = new Map(rows.map((t) => [t.id, t]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const itemsOf = new Map(items.map((r) => [r.typeId, r.n]));
  const filled = new Map(values.map((r) => [r.paramId, r.n]));

  const view = (t: TypeRow): TypeView => {
    const chain = chainOf(byId, t.id);
    return {
      ...t,
      depth: chain.length - 1,
      path: chain.map((c) => c.name).join(" › "),
      category: t.categoryId === null ? null : (categoryName.get(t.categoryId) ?? null),
      items: itemsOf.get(t.id) ?? 0,
      params: chain.flatMap((c) =>
        params.filter((p) => p.typeId === c.id).map((p) => ({ ...p, filledIn: filled.get(p.id) ?? 0, inherited: c.id !== t.id })),
      ),
    };
  };
  // a type, then the types under it, each level by name
  const underOf = (parentId: number | null) =>
    rows.filter((t) => t.parentId === parentId).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const walk = (parentId: number | null): TypeRow[] => underOf(parentId).flatMap((t) => [t, ...walk(t.id)]);
  return walk(null).map(view);
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

/** Refuses a category of the budget that does not exist. */
async function checkCategoryId(reader: Reader, categoryId: number | undefined) {
  if (categoryId !== undefined && (await reader.select({ id: category.id }).from(category).where(eq(category.id, categoryId))).length === 0) {
    throw invalid(`Unknown category ${categoryId}`);
  }
}

/** The name of the category of the budget a type is linked to; null when it has none yet (or there is no type). */
export async function categoryOfType(reader: Reader, typeId: number | null | undefined): Promise<string | null> {
  if (typeId == null) return null;
  const [row] = await reader
    .select({ name: category.name })
    .from(itemType)
    .innerJoin(category, eq(category.id, itemType.categoryId))
    .where(eq(itemType.id, typeId));
  return row?.name ?? null;
}

/** The names of the types under one parent are unique (any case): "Other" can be under IC and under Passives. */
async function refuseTwinType(tx: Tx, name: string, parentId: number | null, exceptId?: number) {
  const [twin] = await tx
    .select()
    .from(itemType)
    .where(and(sql`lower(${itemType.name}) = lower(${name})`, sql`coalesce(${itemType.parentId}, 0) = ${parentId ?? 0}`));
  if (twin && twin.id !== exceptId) throw conflict(`There is already a type "${twin.name}"${parentId === null ? "" : " under it"}`);
}

/**
 * A type and its sub-types must not write the same parameter twice: along every line from a root down, the names are unique.
 * `parentOf` says where a type would be (when one is moved).
 */
function refuseTwinParamsAlong(types: Map<number, TypeRow>, params: Param[], rootOfCheck: number, parentOf: (id: number) => number | null) {
  for (const id of subtreeOf(types, rootOfCheck)) {
    const names = new Map<string, string>();
    for (let t: number | null = id; t !== null; t = parentOf(t)) {
      for (const p of params.filter((x) => x.typeId === t)) {
        const key = p.name.toLowerCase();
        if (names.has(key)) throw conflict(`"${names.get(key)}" would be written twice for "${types.get(id)!.name}"`);
        names.set(key, p.name);
      }
    }
  }
}

/** A new type: a type of its own, or a kind of the `parentId` one, which gives it its category when none is given. */
export async function createType(input: { name: string; areaId: number | null; hazards: boolean; categoryId?: number; parentId?: number | null }) {
  const actor = await asManager();
  return runWrite(actor, async (tx) => {
    const parent = input.parentId == null ? null : (await typeRows(tx)).get(input.parentId);
    if (input.parentId != null && !parent) throw invalid(`Unknown type ${input.parentId}`);
    const categoryId = input.categoryId ?? parent?.categoryId ?? undefined;
    if (categoryId === undefined) throw invalid("A type needs a category of the budget");
    await checkAreaAndType(tx, input);
    await checkCategoryId(tx, categoryId);
    await refuseTwinType(tx, input.name, parent?.id ?? null);
    const { parentId: _ignored, ...columns } = input;
    const [created] = await tx.insert(itemType).values({ ...columns, categoryId, parentId: parent?.id ?? null }).returning();
    return created!;
  });
}

export async function updateType(typeId: number, input: { name?: string; areaId?: number | null; hazards?: boolean; categoryId?: number; parentId?: number | null }) {
  const actor = await asManager();
  return runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(itemType).where(eq(itemType.id, typeId)).for("update");
    if (!target) throw notFound("Type");
    await checkAreaAndType(tx, input);
    await checkCategoryId(tx, input.categoryId);
    const parentId = input.parentId === undefined ? target.parentId : input.parentId;
    if (input.name !== undefined || parentId !== target.parentId) await refuseTwinType(tx, input.name ?? target.name, parentId, typeId);
    if (parentId !== target.parentId) {
      // the tree is locked while a type is moved: two moves at once could make a loop
      const types = await typeRows(tx);
      if (parentId !== null && !types.has(parentId)) throw invalid(`Unknown type ${parentId}`);
      if (parentId !== null && subtreeOf(types, typeId).includes(parentId)) throw invalid("A type cannot go under itself or under one of its own sub-types");
      const params = await tx.select().from(itemTypeParam);
      refuseTwinParamsAlong(types, params, typeId, (id) => (id === typeId ? parentId : (types.get(id)?.parentId ?? null)));
    }
    if (Object.keys(input).length === 0) return target;
    const [updated] = await tx.update(itemType).set(input).where(eq(itemType.id, typeId)).returning();
    // the items of a type take its category: a new one reaches them all (and the history shows each)
    if (input.categoryId !== undefined && input.categoryId !== target.categoryId) {
      const name = await categoryOfType(tx, typeId);
      await tx.update(inventoryItem).set({ category: name }).where(eq(inventoryItem.typeId, typeId));
    }
    return updated!;
  });
}

/** Deletes a type with no sub-types and no item; its parameters go with it. */
export async function deleteType(typeId: number) {
  const actor = await asManager();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(itemType).where(eq(itemType.id, typeId)).for("update");
    if (!target) throw notFound("Type");
    const under = count0(await tx.select({ n: count() }).from(itemType).where(eq(itemType.parentId, typeId)));
    if (under > 0) throw conflict(`"${target.name}" has ${under} sub-types: delete or move them first`);
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

/** The same name cannot be written twice along a line of the tree: not by the type, a parent or a sub-type of it. */
async function refuseTwinParam(tx: Tx, typeId: number, name: string, exceptId?: number) {
  const types = await typeRows(tx);
  const near = new Set([...chainOf(types, typeId).map((t) => t.id), ...subtreeOf(types, typeId)]);
  const twins = await tx.select().from(itemTypeParam).where(and(inArray(itemTypeParam.typeId, [...near]), sql`lower(${itemTypeParam.name}) = lower(${name})`));
  const twin = twins.find((p) => p.id !== exceptId);
  if (twin) throw conflict(twin.typeId === typeId ? `The type already has "${twin.name}"` : `"${twin.name}" is already written by "${types.get(twin.typeId)?.name}", above or under this type`);
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
  // the parameters of the type and of its parents; shared lock: a parameter cannot be deleted or changed while it is being written
  const chain = chainOf(await typeRows(tx), typeId).map((t) => t.id);
  const params = await tx.select().from(itemTypeParam).where(inArray(itemTypeParam.typeId, chain)).for("share");
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

/** What is written about each item for the parameters of its type and of its parents (the values kept from a type it had before are left out). */
export async function valuesByItem(reader: Reader = db, itemId?: number): Promise<Map<number, ParamValues>> {
  const rows = await reader
    .select({
      itemId: itemParamValue.itemId, paramId: itemParamValue.paramId, owner: itemTypeParam.typeId, itemType: inventoryItem.typeId,
      number: itemParamValue.number, text: itemParamValue.text, flag: itemParamValue.flag,
    })
    .from(itemParamValue)
    .innerJoin(itemTypeParam, eq(itemTypeParam.id, itemParamValue.paramId))
    .innerJoin(inventoryItem, eq(inventoryItem.id, itemParamValue.itemId))
    .where(itemId === undefined ? undefined : eq(itemParamValue.itemId, itemId));
  const types = await typeRows(reader);
  const chains = new Map<number, Set<number>>();
  const chainIds = (typeId: number) => chains.get(typeId) ?? chains.set(typeId, new Set(chainOf(types, typeId).map((t) => t.id))).get(typeId)!;
  const byItem = new Map<number, ParamValues>();
  for (const r of rows) {
    if (r.itemType === null || !chainIds(r.itemType).has(r.owner)) continue;
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
  const types = await typeRows(db);
  const found: Set<number>[] = [];
  for (const filter of filters) {
    const param = params.find((p) => p.id === filter.paramId);
    if (!param) throw invalid(`Unknown parameter ${filter.paramId}`);
    found.push(new Set(await matchingOne(param, filter, subtreeOf(types, param.typeId))));
  }
  return found.reduce((all, one) => new Set([...all].filter((itemId) => one.has(itemId))));
}

/** `typeIds`: the type of the parameter and the types under it: the items of any of them have it. */
async function matchingOne(param: Param, filter: ParamFilter, typeIds: number[]): Promise<number[]> {
  const ofType = inArray(inventoryItem.typeId, typeIds);
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
