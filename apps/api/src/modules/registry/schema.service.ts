import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  atLeast, canSeeTable, dropFields, fieldProblem, filterFields, formulaRefs, fromText, groupLevels, groupViews, isComputed, isStored, matches, normalizeValue,
  openRegistry, parseFormula, recordPermission, showExpression, storeExpression, tablePermission, textOf, FormulaError,
  type AccessRule, type Field, type FieldOptions, type FieldType, type Filter, type Registry, type Table, type View, type ViewConfig,
} from "@erp/registry";
import { eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { db } from "../../db/client";
import { regField, regRecord, regSettings, regTable, regView } from "../../db/schema";
import { getCurrentUser, requireAdmin } from "../auth/auth.service";
import { fieldOf, filterFrom, needTable, tableIdOf, tableOf, viewerOf, visibleFields } from "./registry.access";
import { loadRegistry } from "./registry.data";
import type { createFieldInput, createTableInput, createViewInput, settingsInput, updateFieldInput, updateTableInput, updateViewInput } from "./registry.schema";
import { recordOut, registryWrite, usedOutside } from "./registry.write";

// The description of the registry: tables, fields, views and forms, settings, groups (docs/anagrafiche.md,
// §3–§8; the webhooks are in webhooks.service.ts). Creating tables is for the admins; the rest for who manages the table.

const schemaOnly = async () => openRegistry(await loadRegistry(db, []));

export async function managed(tableRef: string | number) {
  const tableId = await tableIdOf(tableRef);
  const reg = openRegistry(await loadRegistry(db, [tableId]));
  const table = tableOf(reg, tableId);
  const viewer = viewerOf(reg);
  needTable(reg, table, viewer, "manage");
  return { reg, table, viewer, actor: await getCurrentUser() };
}

/** A field as the site and the API describe it: a formula with names, not ids. */
export function fieldOut(reg: Registry, field: Field) {
  const options: FieldOptions = { ...field.options };
  if (field.type === "formula") options.expression = showExpression(field.options.expression ?? "", reg.fieldsOf(field.tableId));
  if (field.type === "button" && field.options.url) options.url = showExpression(field.options.url, reg.fieldsOf(field.tableId));
  return { id: field.id, name: field.name, type: field.type, options, required: field.required, unique: field.unique, description: field.description, position: field.position };
}

/** GET /registry/tables: the tables the person may see, with what they may do there. */
export async function listTables() {
  const reg = await schemaOnly();
  const viewer = viewerOf(reg);
  return reg.snapshot.tables
    .filter((t) => canSeeTable(reg, t, viewer))
    .sort((a, b) => a.section.localeCompare(b.section) || a.position - b.position || a.id - b.id)
    .map((t) => ({ id: t.id, name: t.name, description: t.description, icon: t.icon, section: t.section, level: tablePermission(reg, t, viewer).level ?? "read" }));
}

/** GET /registry/tables/:t: fields, views, forms, and (for who manages it) the rules. */
export async function getTable(tableRef: string | number) {
  const tableId = await tableIdOf(tableRef);
  const reg = openRegistry(await loadRegistry(db, [tableId]));
  const table = tableOf(reg, tableId);
  const viewer = viewerOf(reg);
  if (!canSeeTable(reg, table, viewer)) throw forbidden("You cannot see this table");
  const permission = tablePermission(reg, table, viewer);
  const manages = atLeast(permission.level, "manage");
  const fields = manages ? reg.fieldsOf(table.id) : visibleFields(reg, table, viewer);
  return {
    id: table.id,
    name: table.name,
    description: table.description,
    icon: table.icon,
    section: table.section,
    primaryFieldId: table.primaryFieldId,
    isPeople: reg.snapshot.settings.peopleTableId === table.id,
    level: permission.level,
    writable: fields.filter((f) => permission.writable.has(f.id)).map((f) => f.id),
    fields: fields.map((f) => fieldOut(reg, f)),
    // a form for a group is listed for who manages the table only; the others reach it from the menu of forms
    views: reg.viewsOf(table.id).filter((v) => v.type !== "form" || manages).map((v) => viewOut(v)),
    access: manages ? table.access : undefined,
  };
}

/** A view as the site and the API describe it: the hash of the password of a shared view stays here. */
export function viewOut(v: View) {
  const { sharedPassword, ...config } = v.config;
  return { id: v.id, name: v.name, type: v.type, position: v.position, slug: v.slug, config: { ...config, hasPassword: sharedPassword !== undefined } };
}

/** The password of a shared view, kept as `scrypt:<salt>:<hash>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function passwordMatches(stored: string, password: string): boolean {
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const given = scryptSync(password, salt, 32);
  return timingSafeEqual(given, Buffer.from(hash, "hex"));
}

/** POST /registry/tables (admins): a new table with a "Name" field and a view of all its records. */
export async function createTable(input: z.infer<typeof createTableInput>) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const id = await registryWrite(actor, "api", async (w) => {
    const [{ next }] = (await w.tx.select({ next: sql<number>`coalesce(max(${regTable.position}), 0) + 1` }).from(regTable)) as [{ next: number }];
    const [table] = await w.tx.insert(regTable).values({ name: input.name, description: input.description ?? "", icon: input.icon ?? "", section: input.section ?? "", position: next }).returning({ id: regTable.id });
    const [name] = await w.tx.insert(regField).values({ tableId: table!.id, name: "Name", type: "text", position: 1 }).returning({ id: regField.id });
    await w.tx.update(regTable).set({ primaryFieldId: name!.id }).where(eq(regTable.id, table!.id));
    await w.tx.insert(regView).values({ tableId: table!.id, name: "All", type: "grid", position: 1 });
    w.touched.add(table!.id);
    return table!.id;
  });
  return getTable(id);
}

/** The rules of a table as sent by a client, with fields named by name, checked and turned into ids. */
function accessFrom(reg: Registry, table: Table, rules: z.infer<typeof updateTableInput>["access"] & object): AccessRule[] {
  const groups = new Set(groupViews(reg).map((v) => v.id));
  const peopleTableId = reg.snapshot.settings.peopleTableId;
  return rules.map((rule) => {
    const ids = (list: (string | number)[] | undefined) => list?.map((ref) => fieldOf(reg, table, ref).id);
    let who: AccessRule["who"];
    if (rule.who.kind === "group") {
      if (!groups.has(rule.who.groupId)) throw invalid("That group does not exist: a group is a view of the people table marked as a group");
      who = { kind: "group", groupId: rule.who.groupId };
    } else if (rule.who.kind === "self") {
      if (rule.who.linkFieldId === undefined) {
        if (table.id !== peopleTableId) throw invalid("In this table, choose the link to the people that says whose a record is");
        who = { kind: "self" };
      } else {
        const link = fieldOf(reg, table, rule.who.linkFieldId);
        if (link.type !== "link" || link.options.tableId !== peopleTableId) throw invalid(`${link.name} is not a link to the people table`);
        who = { kind: "self", linkFieldId: link.id };
      }
    } else who = { kind: "everyone" };
    const out: AccessRule = { who, level: rule.level };
    const hidden = ids(rule.hidden);
    const readOnly = ids(rule.readOnly);
    if (hidden?.length) out.hidden = hidden;
    if (readOnly?.length) out.readOnly = readOnly;
    return out;
  });
}

/** PATCH /registry/tables/:t */
export async function updateTable(tableRef: string | number, patch: z.infer<typeof updateTableInput>) {
  const { reg, table, actor } = await managed(tableRef);
  const changes: Partial<typeof regTable.$inferInsert> = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.description !== undefined) changes.description = patch.description;
  if (patch.icon !== undefined) changes.icon = patch.icon;
  if (patch.section !== undefined) changes.section = patch.section;
  if (patch.position !== undefined) changes.position = patch.position;
  if (patch.primaryFieldId !== undefined) {
    const field = fieldOf(reg, table, patch.primaryFieldId);
    if (["attachment", "button", "json"].includes(field.type)) throw invalid("That field cannot name the records");
    changes.primaryFieldId = field.id;
  }
  if (patch.access !== undefined) changes.access = accessFrom(reg, table, patch.access);
  if (Object.keys(changes).length > 0) {
    await registryWrite(actor, "api", async (w) => {
      await w.tx.update(regTable).set(changes).where(eq(regTable.id, table.id));
      w.touched.add(table.id);
    });
  }
  return getTable(table.id);
}

/** DELETE /registry/tables/:t (admins): refused while other tables link to it or the registry needs it. */
export async function deleteTable(tableRef: string | number) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const tableId = await tableIdOf(tableRef);
  const reg = await schemaOnly();
  const table = tableOf(reg, tableId);
  const incoming = reg.snapshot.fields.find((f) => f.type === "link" && f.options.tableId === tableId && f.tableId !== tableId);
  if (incoming) throw conflict(`${reg.table(incoming.tableId)?.name} links to this table (${incoming.name}): delete that link first`);
  if (reg.snapshot.settings.peopleTableId === tableId) throw conflict("This is the people table of the registry: choose another one in the settings first");
  await registryWrite(actor, "api", async (w) => {
    await w.tx.delete(regTable).where(eq(regTable.id, table.id));
    w.touched.add(table.id);
  });
}

/** The options of a field as sent by a client: tables and fields by name, formulas with names, checked. */
function optionsFrom(reg: Registry, table: Table, type: FieldType, input: z.infer<typeof createFieldInput>["options"], current?: Field): FieldOptions {
  const o: FieldOptions & Record<string, unknown> = { ...(current?.options ?? {}), ...(input ?? {}) } as FieldOptions & Record<string, unknown>;
  if (type === "link" && input?.tableId !== undefined) {
    const target = reg.findTable(input.tableId as string | number);
    if (!target) throw invalid("There is no such table to link to");
    o.tableId = target.id;
  }
  if ((type === "lookup" || type === "rollup") && input?.linkFieldId !== undefined) {
    const link = fieldOf(reg, table, input.linkFieldId as string | number);
    o.linkFieldId = link.id;
    if (input.fieldId !== undefined) {
      const targetTable = reg.table(link.options.tableId ?? 0);
      if (!targetTable) throw invalid("The link points at no table");
      o.fieldId = fieldOf(reg, targetTable, input.fieldId as string | number).id;
    }
  }
  for (const key of ["expression", "url"] as const) {
    if (input?.[key] === undefined || (key === "expression" ? type !== "formula" : type !== "button")) continue;
    try {
      o[key] = input[key] === "" ? undefined : storeExpression(input[key]!, reg.fieldsOf(table.id));
    } catch (error) {
      throw invalid(error instanceof FormulaError ? `Formula: ${error.message}` : "The formula cannot be read");
    }
  }
  if (type === "link" && input?.limitViewId !== undefined) {
    const view = reg.view(Number(input.limitViewId));
    if (!view || view.tableId !== (o.tableId ?? -1) || view.type === "form") throw invalid("Choose a view of the linked table: its records are the ones offered");
  }
  if ((type === "qrcode" || type === "barcode") && input?.fieldId !== undefined) o.fieldId = fieldOf(reg, table, input.fieldId as string | number).id;
  if (type === "user" && input?.default !== undefined && Array.isArray(input.default)) {
    for (const id of input.default) if (!reg.snapshot.users.some((u) => u.id === Number(id))) throw invalid(`Default value: there is no user #${String(id)}`);
  }
  if (type === "select" || type === "multiselect") o.choices = (o.choices ?? []).map((c) => ({ name: c.name.trim(), ...(c.color ? { color: c.color } : {}) }));
  return o;
}

function checkField(reg: Registry, field: Field) {
  const problem = fieldProblem(reg.snapshot, field);
  if (problem) throw invalid(problem);
}

/** POST /registry/tables/:t/fields: a field; a link also makes its other side in the linked table. */
export async function createField(tableRef: string | number, input: z.infer<typeof createFieldInput>) {
  const { reg, table, actor } = await managed(tableRef);
  const position = Math.max(0, ...reg.fieldsOf(table.id).map((f) => f.position)) + 1;
  const options = optionsFrom(reg, table, input.type, input.options);
  if (input.type === "link") options.multiple = options.multiple ?? true;
  const draft: Field = { id: -1, tableId: table.id, name: input.name.trim(), type: input.type, options, required: input.required ?? false, unique: input.unique ?? false, description: input.description ?? "", position };
  checkField(reg, draft);
  const id = await registryWrite(actor, "api", async (w) => {
    const [row] = await w.tx
      .insert(regField)
      .values({ tableId: table.id, name: draft.name, type: draft.type, options: draft.options, required: draft.required, uniqueValues: draft.unique, description: draft.description, position })
      .returning({ id: regField.id });
    if (input.type === "link") {
      const target = reg.table(options.tableId!)!;
      const taken = new Set(reg.fieldsOf(target.id).map((f) => f.name.toLowerCase()));
      if (target.id === table.id) taken.add(draft.name.toLowerCase());
      let name = input.inverseName?.trim() || (target.id === table.id ? `${draft.name} (from)` : table.name);
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${input.inverseName?.trim() || table.name} ${n}`;
      const [last] = (await w.tx.select({ p: sql<number>`coalesce(max(${regField.position}), 0)` }).from(regField).where(eq(regField.tableId, target.id))) as [{ p: number }];
      const [inverse] = await w.tx
        .insert(regField)
        .values({ tableId: target.id, name, type: "link", options: { tableId: table.id, multiple: input.inverseMultiple ?? true, inverseId: row!.id }, position: last!.p + 1 })
        .returning({ id: regField.id });
      await w.tx.update(regField).set({ options: { ...options, inverseId: inverse!.id } }).where(eq(regField.id, row!.id));
      w.touched.add(target.id);
    }
    // a uuid field gives one to every record already there
    if (input.type === "uuid") await w.tx.execute(sql`update reg_record set data = data || jsonb_build_object(${String(row!.id)}::text, gen_random_uuid()::text) where table_id = ${table.id}`);
    w.touched.add(table.id);
    return row!.id;
  });
  const after = openRegistry(await loadRegistry(db, [table.id]));
  return fieldOut(after, after.field(id)!);
}

/** The simple stored types: a field can change from one to another, its values converted through text. */
const CONVERTIBLE: FieldType[] = ["text", "longtext", "email", "url", "phone", "number", "rating", "checkbox", "date", "datetime", "time", "duration", "select", "multiselect", "geodata", "color", "json"];

/** PATCH /registry/fields/:id: name, options, type (converting the values), required, unique. */
export async function updateField(fieldId: number, patch: z.infer<typeof updateFieldInput>) {
  const schema = await schemaOnly();
  const current = schema.field(fieldId);
  if (!current) throw notFound("Field");
  const { reg, table, actor } = await managed(current.tableId);
  const type = patch.type ?? current.type;
  if (type !== current.type && !(CONVERTIBLE.includes(type) && CONVERTIBLE.includes(current.type))) {
    throw invalid(`A ${current.type} field cannot become ${type}: add a new field instead`);
  }
  if (current.type === "link" && patch.options?.tableId !== undefined && reg.findTable(patch.options.tableId as string | number)?.id !== current.options.tableId) {
    throw invalid("A link cannot point at another table: add a new link instead");
  }
  const options = optionsFrom(reg, table, type, patch.options, current);
  const next: Field = { ...current, name: patch.name?.trim() ?? current.name, type, options, required: patch.required ?? current.required, unique: patch.unique ?? current.unique, description: patch.description ?? current.description };
  checkField(reg, { ...next, options: next.options });

  // the values, converted when the type changes; how many could not be kept
  let lost = 0;
  const converted: { id: number; data: Record<string, unknown> }[] = [];
  if (type !== current.type) {
    for (const r of reg.recordsOf(table.id)) {
      const old = r.data[String(fieldId)];
      if (old === undefined || old === null) continue;
      const result = normalizeValue(next, fromText(type, textOf(old)));
      const data = { ...r.data };
      if (result.ok && result.value !== null) data[String(fieldId)] = result.value;
      else {
        delete data[String(fieldId)];
        lost++;
      }
      converted.push({ id: r.id, data });
    }
  }
  if (next.unique && !current.unique) {
    const seen = new Set<string>();
    for (const r of reg.recordsOf(table.id)) {
      const v = textOf(reg.value(r, current)).trim().toLowerCase();
      if (v === "") continue;
      if (seen.has(v)) throw conflict(`${current.name} cannot be unique: "${v}" is in more than one record`);
      seen.add(v);
    }
  }
  await registryWrite(actor, "api", async (w) => {
    await w.tx.update(regField).set({ name: next.name, type: next.type, options: next.options, required: next.required, uniqueValues: next.unique, description: next.description }).where(eq(regField.id, fieldId));
    for (const c of converted) await w.tx.update(regRecord).set({ data: c.data, version: sql`${regRecord.version} + 1`, updatedAt: new Date(), updatedBy: actor.id }).where(eq(regRecord.id, c.id));
    w.touched.add(table.id);
  });
  const after = openRegistry(await loadRegistry(db, [table.id]));
  return { ...fieldOut(after, after.field(fieldId)!), lostValues: lost };
}

/** What still uses a field (so it cannot go), or null. */
function usedBy(reg: Registry, field: Field, pair: number[]): string | null {
  const name = (f: Field) => `${reg.table(f.tableId)?.name ?? "?"} › ${f.name}`;
  for (const f of reg.snapshot.fields) {
    if (pair.includes(f.id)) continue;
    if ((f.type === "lookup" || f.type === "rollup") && (pair.includes(f.options.linkFieldId ?? 0) || pair.includes(f.options.fieldId ?? 0))) return name(f);
    if ((f.type === "qrcode" || f.type === "barcode") && pair.includes(f.options.fieldId ?? 0)) return name(f);
    if (f.type === "formula") {
      try {
        if (formulaRefs(parseFormula(f.options.expression ?? "")).some((r) => pair.includes(Number(r.slice(1))))) return name(f);
      } catch {
        // a broken formula uses nothing
      }
    }
  }
  for (const t of reg.snapshot.tables) {
    if (t.primaryFieldId !== null && pair.includes(t.primaryFieldId)) return `the name of the records of ${t.name}`;
    if (t.access.some((r) => r.who.kind === "self" && r.who.linkFieldId !== undefined && pair.includes(r.who.linkFieldId))) return `the rules of ${t.name}`;
  }
  if (reg.snapshot.settings.emailFieldId !== null && pair.includes(reg.snapshot.settings.emailFieldId)) return "the settings of the registry (the email of the people)";
  return null;
}

/** A view's configuration without a deleted field. */
function configWithout(config: ViewConfig, gone: number[]): ViewConfig {
  const out: ViewConfig = { ...config };
  const drop = (list?: number[]) => list?.filter((id) => !gone.includes(id));
  out.filter = dropFields(config.filter, gone);
  out.sorts = config.sorts?.filter((s) => !gone.includes(s.field));
  out.hidden = drop(config.hidden);
  out.order = drop(config.order);
  const levels = groupLevels(config.groupBy).filter((id) => !gone.includes(id));
  if (levels.length === 0) delete out.groupBy;
  else out.groupBy = levels.length === 1 ? levels[0] : levels;
  if (config.colorBy !== undefined && gone.includes(config.colorBy)) delete out.colorBy;
  if (config.dependencyField !== undefined && gone.includes(config.dependencyField)) delete out.dependencyField;
  if (config.geoField !== undefined && gone.includes(config.geoField)) delete out.geoField;
  if (config.colors) out.colors = config.colors.map((rule) => ({ ...rule, filter: dropFields(rule.filter, gone)! }));
  if (config.dateField !== undefined && gone.includes(config.dateField)) delete out.dateField;
  if (config.endDateField !== undefined && gone.includes(config.endDateField)) delete out.endDateField;
  if (config.coverField !== undefined && gone.includes(config.coverField)) delete out.coverField;
  if (config.form) {
    out.form = {
      ...config.form,
      fields: config.form.fields.filter((q) => !gone.includes(q.fieldId)).map((q) => (q.showIf ? { ...q, showIf: dropFields(q.showIf, gone) } : q)),
      set: config.form.set?.filter((s) => !gone.includes(s.fieldId)).map((s) => (s.when ? { ...s, when: dropFields(s.when, gone) } : s)),
    };
  }
  return out;
}

/** DELETE /registry/fields/:id: the field and its values (a link, both its sides); refused while something uses it. */
export async function deleteField(fieldId: number) {
  const schema = await schemaOnly();
  const field = schema.field(fieldId);
  if (!field) throw notFound("Field");
  const { reg, table, actor } = await managed(field.tableId);
  const pair = field.type === "link" && field.options.inverseId !== undefined ? [field.id, field.options.inverseId] : [field.id];
  const user = usedBy(reg, field, pair);
  if (user) throw conflict(`${field.name} is used by ${user}: change that first`);
  // another module may use it (the roles of the ERP): it says so, the registry does not know it
  const outside = await usedOutside({ fieldIds: pair });
  if (outside) throw conflict(`${field.name} is used by ${outside}: change that first`);
  const tables = [...new Set(pair.map((id) => reg.field(id)?.tableId ?? table.id))];
  await registryWrite(actor, "api", async (w) => {
    for (const v of reg.snapshot.views.filter((x) => tables.includes(x.tableId))) {
      const config = configWithout(v.config, pair);
      if (JSON.stringify(config) !== JSON.stringify(v.config)) await w.tx.update(regView).set({ config }).where(eq(regView.id, v.id));
    }
    for (const t of reg.snapshot.tables.filter((x) => tables.includes(x.id))) {
      const access = t.access.map((r) => ({ ...r, hidden: r.hidden?.filter((id) => !pair.includes(id)), readOnly: r.readOnly?.filter((id) => !pair.includes(id)) }));
      if (JSON.stringify(access) !== JSON.stringify(t.access)) await w.tx.update(regTable).set({ access }).where(eq(regTable.id, t.id));
    }
    // the values go with the field (a link's are in reg_link and go by cascade)
    if (isStored(field.type)) {
      await w.tx.execute(sql`update reg_record set data = data - ${String(field.id)}, version = version + 1, updated_at = now() where table_id = ${table.id} and data ? ${String(field.id)}`);
    }
    await w.tx.delete(regField).where(inArray(regField.id, pair));
    for (const t of tables) w.touched.add(t);
  });
}

/** PUT /registry/tables/:t/fields/order */
export async function orderFields(tableRef: string | number, ids: number[]) {
  const { reg, table, actor } = await managed(tableRef);
  const own = new Set(reg.fieldsOf(table.id).map((f) => f.id));
  if (ids.some((id) => !own.has(id))) throw invalid("Not a field of this table");
  await registryWrite(actor, "api", async (w) => {
    for (const [i, id] of ids.entries()) await w.tx.update(regField).set({ position: i + 1 }).where(eq(regField.id, id));
    w.touched.add(table.id);
  });
  return getTable(table.id);
}

// --- views and forms ---------------------------------------------------------------------------

type ConfigInput = z.infer<typeof createViewInput>["config"];

/** A view's configuration as sent by a client (fields by name), checked and with ids. */
function configFrom(reg: Registry, table: Table, type: View["type"], input: ConfigInput, current: ViewConfig = {}): ViewConfig {
  if (!input) {
    checkKind(reg, type, current);
    return current;
  }
  // a locked view changes only to be unlocked (and then it may change in the same request)
  if (current.locked && input.locked !== false) throw conflict("This view is locked: unlock it first");
  const id = (ref: string | number) => fieldOf(reg, table, ref).id;
  const filter = (f: unknown): Filter | undefined => (f === undefined ? undefined : filterFrom(reg, table, f, null));
  const config: ViewConfig = {};
  if (input.filter) config.filter = filter(input.filter);
  if (input.sorts) config.sorts = input.sorts.map((s) => ({ field: id(s.field), dir: s.dir }));
  if (input.hidden) config.hidden = input.hidden.map(id);
  if (input.order) config.order = input.order.map(id);
  if (input.widths) config.widths = input.widths;
  if (input.groupBy !== undefined) {
    const levels = (Array.isArray(input.groupBy) ? input.groupBy : [input.groupBy]).map(id);
    if (levels.length > 5) throw invalid("At most five levels of grouping");
    config.groupBy = levels.length === 1 ? levels[0] : levels;
  }
  if (input.rowHeight) config.rowHeight = input.rowHeight;
  if (input.folder?.trim()) config.folder = input.folder.trim();
  if (input.geoField !== undefined) {
    const geo = fieldOf(reg, table, input.geoField);
    if (geo.type !== "geodata") throw invalid(`${geo.name} is not a field of coordinates`);
    config.geoField = geo.id;
  }
  if (input.frozen !== undefined) config.frozen = input.frozen;
  if (input.description) config.description = input.description;
  if (input.locked) config.locked = true;
  if (input.colorBy !== undefined) {
    const by = fieldOf(reg, table, input.colorBy);
    if (by.type !== "select" && by.type !== "multiselect") throw invalid(`${by.name} is not a Choice field: its choices give the colours`);
    config.colorBy = by.id;
  }
  if (input.colors) config.colors = input.colors.map((rule) => ({ filter: filter(rule.filter)!, color: rule.color }));
  if (input.dependencyField !== undefined) {
    const link = fieldOf(reg, table, input.dependencyField);
    if (link.type !== "link" || link.options.tableId !== table.id) throw invalid(`${link.name} is not a link of the table to itself`);
    config.dependencyField = link.id;
  }
  if (input.coverField !== undefined) config.coverField = id(input.coverField);
  for (const key of ["dateField", "endDateField"] as const) {
    if (input[key] === undefined) continue;
    const field = fieldOf(reg, table, input[key]!);
    if (!["date", "datetime", "created", "modified", "formula", "lookup"].includes(field.type)) throw invalid(`${field.name} is not a date`);
    config[key] = field.id;
  }

  if (input.group) {
    if (table.id !== reg.snapshot.settings.peopleTableId || type !== "grid") throw invalid("Only a grid view of the people table can be a group");
    config.group = true;
  }
  if (input.shared) {
    config.shared = true;
    if (input.sharedDownload) config.sharedDownload = true;
    // the password: a new one, none (null or empty), or the one it had
    if (typeof input.sharedPassword === "string" && input.sharedPassword !== "") config.sharedPassword = hashPassword(input.sharedPassword);
    else if (input.sharedPassword === undefined && current.sharedPassword) config.sharedPassword = current.sharedPassword;
  }
  if (type === "form") {
    if (!input.form) throw invalid("A form needs its settings");
    const f = input.form;
    if (f.access.kind === "group" && !groupViews(reg).some((v) => v.id === (f.access as { groupId: number }).groupId)) throw invalid("That group does not exist");
    if (f.mode === "update" && !f.target) throw invalid("A form that changes records must say which one: the person's own, a personal link, or one picked");
    if (f.target === "me" && table.id !== reg.snapshot.settings.peopleTableId) throw invalid("Only a form on the people table can change the person's own record");
    if (f.target === "pick") {
      const pick = f.pickViewId === undefined ? undefined : reg.view(f.pickViewId);
      if (!pick || pick.tableId !== table.id) throw invalid("Choose the view of this table the records are picked from");
    }
    const fieldIds = f.fields.map((q) => id(q.fieldId));
    if (new Set(fieldIds).size !== fieldIds.length) throw invalid("A field is asked twice");
    for (const q of f.fields) {
      const field = fieldOf(reg, table, q.fieldId);
      if (isComputed(field.type)) throw invalid(`${field.name} is worked out: it cannot be a question`);
      if (q.validate?.pattern) {
        try {
          new RegExp(q.validate.pattern);
        } catch {
          throw invalid(`${field.name}: the pattern of the answers is not a valid regular expression`);
        }
      }
    }
    config.form = {
      ...f,
      fields: f.fields.map((q) => ({ ...q, fieldId: id(q.fieldId), showIf: filter(q.showIf) })),
      set: f.set?.map((s) => ({ ...s, fieldId: id(s.fieldId), when: filter(s.when) })),
    } as ViewConfig["form"];
  }
  // a filter of a view may only use fields of its table
  for (const fid of filterFields(config.filter)) if (reg.field(fid)?.tableId !== table.id) throw invalid("The filter uses a field of another table");
  checkKind(reg, type, config);
  return config;
}

/** What a kind of view cannot do without: the date of a calendar or a timeline, the choice of a kanban. */
function checkKind(reg: Registry, type: View["type"], config: ViewConfig) {
  if ((type === "calendar" || type === "timeline") && config.dateField === undefined) throw invalid("A calendar or a timeline needs the date field");
  if (type === "kanban" && reg.field(groupLevels(config.groupBy)[0] ?? 0)?.type !== "select") throw invalid("A kanban needs a Choice field to make its columns");
  if (type === "map" && reg.field(config.geoField ?? 0)?.type !== "geodata") throw invalid("A map needs a field of coordinates");
}

/** POST /registry/tables/:t/views */
export async function createView(tableRef: string | number, input: z.infer<typeof createViewInput>) {
  const { reg, table, actor } = await managed(tableRef);
  const config = configFrom(reg, table, input.type, input.config);
  if ((input.type === "form" || config.shared) && !input.slug) throw invalid("A form or a public view needs an address (slug)");
  const position = Math.max(0, ...reg.viewsOf(table.id).map((v) => v.position)) + 1;
  const id = await registryWrite(actor, "api", async (w) => {
    const [row] = await w.tx.insert(regView).values({ tableId: table.id, name: input.name, type: input.type, position, slug: input.slug ?? null, config }).returning({ id: regView.id });
    w.touched.add(table.id);
    return row!.id;
  });
  const [row] = await db.select().from(regView).where(eq(regView.id, id));
  return viewOut({ ...row!, type: row!.type as View["type"], config: row!.config as ViewConfig });
}

/** PATCH /registry/views/:id */
export async function updateView(viewId: number, patch: z.infer<typeof updateViewInput>) {
  const [current] = await db.select().from(regView).where(eq(regView.id, viewId));
  if (!current) throw notFound("View");
  const { reg, table, actor } = await managed(current.tableId);
  const type = current.type as View["type"];
  const before = current.config as ViewConfig;
  if (before.locked && !patch.config && (patch.name !== undefined || patch.slug !== undefined)) throw conflict("This view is locked: unlock it first");
  const config = patch.config ? configFrom(reg, table, type, patch.config, before) : before;
  const slug = patch.slug === undefined ? current.slug : patch.slug;
  if ((type === "form" || config.shared) && !slug) throw invalid("A form or a public view needs an address (slug)");
  if ((current.config as ViewConfig).group && !config.group) await refuseIfGroupUsed(reg, viewId);
  await registryWrite(actor, "api", async (w) => {
    await w.tx.update(regView).set({ name: patch.name ?? current.name, position: patch.position ?? current.position, slug, config }).where(eq(regView.id, viewId));
    w.touched.add(table.id);
  });
  const [row] = await db.select().from(regView).where(eq(regView.id, viewId));
  return viewOut({ ...row!, type: row!.type as View["type"], config: row!.config as ViewConfig });
}

async function refuseIfGroupUsed(reg: Registry, viewId: number) {
  const inRules = reg.snapshot.tables.find((t) => t.access.some((r) => r.who.kind === "group" && r.who.groupId === viewId));
  if (inRules) throw conflict(`This group is used by the rules of ${inRules.name}: change them first`);
  const inForms = reg.snapshot.views.find((v) => v.config.form?.access.kind === "group" && (v.config.form.access as { groupId: number }).groupId === viewId);
  if (inForms) throw conflict(`This group is used by the form ${inForms.name}: change it first`);
  const outside = await usedOutside({ viewId });
  if (outside) throw conflict(`This group is used by ${outside}: change that first`);
}

/** DELETE /registry/views/:id: refused for a group still in use, and for the last view of a table. */
export async function deleteView(viewId: number) {
  const [current] = await db.select().from(regView).where(eq(regView.id, viewId));
  if (!current) throw notFound("View");
  const { reg, table, actor } = await managed(current.tableId);
  if ((current.config as ViewConfig).group) await refuseIfGroupUsed(reg, viewId);
  if (reg.viewsOf(table.id).filter((v) => v.type !== "form").length === 1 && current.type !== "form") throw conflict("A table keeps at least one view");
  const pickers = reg.snapshot.views.find((v) => v.config.form?.pickViewId === viewId);
  if (pickers) throw conflict(`The form ${pickers.name} picks its records from this view: change it first`);
  await registryWrite(actor, "api", async (w) => {
    await w.tx.delete(regView).where(eq(regView.id, viewId));
    w.touched.add(table.id);
  });
}

// --- settings, groups, me ------------------------------------------------------------------------

/** GET /registry/settings */
export async function getRegistrySettings() {
  const reg = await schemaOnly();
  return { ...reg.snapshot.settings, groups: groupViews(reg).map((v) => ({ id: v.id, name: v.name })) };
}

/** PUT /registry/settings (admins): which table holds the people, and which field their sign-in email. */
export async function setRegistrySettings(input: z.infer<typeof settingsInput>) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const reg = await schemaOnly();
  if (input.peopleTableId !== null && !reg.table(input.peopleTableId)) throw invalid("There is no such table");
  if (input.emailFieldId !== null) {
    const field = reg.field(input.emailFieldId);
    if (!field || field.tableId !== input.peopleTableId) throw invalid("The email field must be a field of the people table");
    if (!["email", "text", "formula", "lookup"].includes(field.type)) throw invalid("That field cannot hold an email");
  }
  if (input.peopleTableId !== reg.snapshot.settings.peopleTableId && groupViews(reg).length > 0) {
    const used = reg.snapshot.tables.find((t) => t.access.some((r) => r.who.kind === "group"));
    if (used) throw conflict(`The groups of the people table are used by the rules of ${used.name}: change them first`);
  }
  await registryWrite(actor, "api", async (w) => {
    await w.tx.update(regSettings).set({ peopleTableId: input.peopleTableId, emailFieldId: input.emailFieldId }).where(eq(regSettings.id, 1));
    if (input.peopleTableId !== null) w.touched.add(input.peopleTableId);
  });
  return getRegistrySettings();
}

/** GET /registry/me: the person's own record (what they may see of it) and their groups. */
export async function registryMe() {
  const { peopleTableId } = (await schemaOnly()).snapshot.settings;
  const reg = openRegistry(await loadRegistry(db, peopleTableId === null ? [] : [peopleTableId]));
  const viewer = viewerOf(reg);
  const person = viewer.personId === null ? undefined : reg.record(viewer.personId);
  const table = peopleTableId === null ? undefined : reg.table(peopleTableId);
  let record = null;
  if (person && table) {
    const visible = recordPermission(reg, table, person, viewer).visible;
    record = recordOut(reg, person, reg.fieldsOf(table.id).filter((f) => visible.has(f.id)));
  }
  return { peopleTableId, personId: viewer.personId, record, groups: groupViews(reg).filter((v) => viewer.groups.includes(v.id)).map((v) => ({ id: v.id, name: v.name })) };
}

/** GET /registry/groups/:id/members: who is in a group (admins and who manages the people table). */
export async function groupMembers(viewId: number) {
  const { peopleTableId, emailFieldId } = (await schemaOnly()).snapshot.settings;
  if (peopleTableId === null) throw notFound("Group");
  const reg = openRegistry(await loadRegistry(db, [peopleTableId]));
  const group = groupViews(reg).find((v) => v.id === viewId);
  if (!group) throw notFound("Group");
  needTable(reg, tableOf(reg, peopleTableId), viewerOf(reg), "manage");
  const env = { today: reg.snapshot.today, peopleTableId };
  const email = emailFieldId === null ? undefined : reg.field(emailFieldId);
  return reg
    .recordsOf(peopleTableId)
    .filter((r) => matches(reg, r, group.config.filter, env))
    .map((r) => ({ id: r.id, name: reg.display(r.id), email: email ? textOf(reg.value(r, email)) || null : null }));
}

// --- one of a kind, and the parts of a view ---------------------------------------------------------

/** GET /registry/fields/:id */
export async function getField(fieldId: number) {
  const schema = await schemaOnly();
  const field = schema.field(fieldId);
  if (!field) throw notFound("Field");
  const tableId = field.tableId;
  const reg = openRegistry(await loadRegistry(db, [tableId]));
  const table = tableOf(reg, tableId);
  const viewer = viewerOf(reg);
  const manages = atLeast(tablePermission(reg, table, viewer).level, "manage");
  if (!manages && !visibleFields(reg, table, viewer).some((f) => f.id === fieldId)) throw notFound("Field");
  return fieldOut(reg, reg.field(fieldId)!);
}

/** GET /registry/views/:id: a view of a table the person may see (a form, for who manages the table). */
export async function getView(viewId: number) {
  const [row] = await db.select({ tableId: regView.tableId }).from(regView).where(eq(regView.id, viewId));
  if (!row) throw notFound("View");
  const table = await getTable(row.tableId);
  const view = table.views.find((v) => v.id === viewId);
  if (!view) throw notFound("View");
  return view;
}

/** GET and PUT /registry/views/:id/filters and /sorts: the filter or the sorts of a view alone (NocoDB's meta API). */
export async function viewPart(viewId: number, part: "filter" | "sorts") {
  const view = await getView(viewId);
  return part === "filter" ? { filter: view.config.filter ?? null } : { sorts: view.config.sorts ?? [] };
}

export async function setViewPart(viewId: number, part: "filter" | "sorts", value: unknown) {
  const [current] = await db.select().from(regView).where(eq(regView.id, viewId));
  if (!current) throw notFound("View");
  // the rest of the configuration as it is, with fields by id (configFrom reads ids and names alike)
  const { sharedPassword: _hash, ...config } = current.config as ViewConfig;
  const next = { ...config, [part]: value ?? undefined } as Record<string, unknown>;
  if (next.filter === undefined) delete next.filter;
  await updateView(viewId, { config: next as z.infer<typeof updateViewInput>["config"] });
  return viewPart(viewId, part);
}
