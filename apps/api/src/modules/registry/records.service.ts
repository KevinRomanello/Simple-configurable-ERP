import {
  AGGREGATE_FNS, atLeast, fromText, groupLevels, isComputed, isStored, matches, normalizeValue, openRegistry, parseCsv, parseWhere, recordColor, recordPermission, runQuery, tablePermission,
  textOf, toCsv, WhereError, type AggregateFn, type Field, type Filter, type RecordRow, type Registry, type Sort, type Table, type View, type Viewer,
} from "@erp/registry";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { AppError, forbidden, invalid, notFound } from "../../core/errors";
import { db } from "../../db/client";
import { appUser, auditLog, regField, regFile, regWebhook } from "../../db/schema";
import { getCurrentUser } from "../../platform/auth/auth.service";
import { fieldOf, filterFrom, needRecord, needTable, tableIdOf, tableOf, viewerOf, visibleFields, visibleRecords } from "./registry.access";
import { loadRegistry } from "./registry.data";
import type { bulkInput, importInput, recordsQuery, upsertInput } from "./registry.schema";
import { deleteRecords, queueWebhooks, recordOut, registryWrite, saveRecords, type RecordChange } from "./registry.write";

// The records of the registry tables: list, read, write, links, files, buttons, history, CSV
// (docs/anagrafiche.md, §10.2). Every function checks the rules of the table for the person asking.

export async function open(tableRef: string | number) {
  const tableId = await tableIdOf(tableRef);
  const reg = openRegistry(await loadRegistry(db, [tableId]));
  const table = tableOf(reg, tableId);
  return { reg, table, viewer: viewerOf(reg) };
}

/** `-Date,Name` → sorts; only fields the viewer sees. */
function sortsFrom(reg: Registry, table: Table, text: string, allowed: Set<number>): Sort[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => {
      const dir = s.startsWith("-") ? "desc" : "asc";
      const field = fieldOf(reg, table, s.replace(/^[-+]/, ""));
      if (!allowed.has(field.id)) throw invalid(`There is no field "${s}" in ${table.name}`);
      return { field: field.id, dir };
    });
}

export type Query = Partial<z.infer<typeof recordsQuery>>;

/** A `where` of NocoDB on the fields the viewer may use; a sentence for people when it cannot be read. */
function whereFilter(reg: Registry, table: Table, where: string, allowed: Set<number>): Filter {
  try {
    return parseWhere(
      where,
      (name) => {
        const f = reg.findField(table.id, name);
        return f && allowed.has(f.id) ? f.id : undefined;
      },
      (id) => reg.field(id)?.type,
    );
  } catch (error) {
    if (error instanceof WhereError) throw invalid(`where: ${error.message}`);
    throw error;
  }
}

const viewOf = (reg: Registry, table: Table, ref: string | number): View => {
  const view = reg.viewsOf(table.id).find((v) => String(v.id) === String(ref) || v.name.toLowerCase() === String(ref).toLowerCase());
  if (!view) throw notFound("View");
  return view;
};

/** The records a query asks for, with the fields to show, before paging. */
export function select(reg: Registry, table: Table, viewer: Viewer, query: Query) {
  const visible = visibleFields(reg, table, viewer);
  const allowed = new Set(visible.map((f) => f.id));
  const view = query.view !== undefined ? viewOf(reg, table, query.view) : undefined;

  const parts: Filter[] = [];
  // the filter of a view is its maker's choice, and may use fields the viewer does not see
  if (view?.config.filter) parts.push(view.config.filter);
  if (query.filter) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(query.filter);
    } catch {
      throw invalid("filter: not valid JSON");
    }
    parts.push(filterFrom(reg, table, parsed, allowed));
  }
  if (query.where) parts.push(whereFilter(reg, table, query.where, allowed));
  const sorts = query.sort ? sortsFrom(reg, table, query.sort, allowed) : (view?.config.sorts ?? []);
  const groupBy = query.groupBy !== undefined
    ? query.groupBy.split(",").map((s) => s.trim()).filter((s) => s !== "").map((s) => fieldOf(reg, table, s).id)
    : groupLevels(view?.config.groupBy);
  if (groupBy.length > 5 || groupBy.some((id) => !allowed.has(id))) throw invalid("There is no such field to group by");

  let shown: Field[];
  if (query.fields) {
    shown = query.fields.split(",").map((s) => s.trim()).filter((s) => s !== "").map((s) => fieldOf(reg, table, s));
    if (shown.some((f) => !allowed.has(f.id))) throw invalid("One of the fields asked for does not exist");
  } else {
    const hidden = new Set(view?.config.hidden ?? []);
    const order = view?.config.order ?? [];
    shown = visible.filter((f) => !hidden.has(f.id)).sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return ia >= 0 && ib >= 0 ? ia - ib : ia >= 0 ? -1 : ib >= 0 ? 1 : 0;
    });
  }
  const aggregates = (query.aggregate ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => {
      const at = s.indexOf(":");
      const fn = s.slice(0, at) as AggregateFn;
      if (at < 0 || !AGGREGATE_FNS.includes(fn)) throw invalid(`aggregate: "${s}" is not one of ${AGGREGATE_FNS.join(", ")} followed by :field`);
      const field = fieldOf(reg, table, s.slice(at + 1));
      if (!allowed.has(field.id)) throw invalid(`There is no field "${s.slice(at + 1)}" in ${table.name}`);
      return { field: field.id, fn };
    });
  const filter: Filter = { join: "and", items: parts };
  const env = { today: reg.snapshot.today, peopleTableId: reg.snapshot.settings.peopleTableId, me: { email: viewer.email, personId: viewer.personId, userId: viewer.userId } };
  const rows = visibleRecords(reg, table, viewer);
  return { view, shown, rows, filter, sorts, groupBy, aggregates, env, search: query.q, searchFields: visible };
}

/** One record with the fields the viewer may see of it (of the ones asked for). */
export function out(reg: Registry, table: Table, record: RecordRow, viewer: Viewer, shown: Field[], byId = false) {
  const permission = recordPermission(reg, table, record, viewer);
  return recordOut(reg, record, shown.filter((f) => permission.visible.has(f.id)), byId);
}

/** The records a request is about, filtered, searched and sorted, before paging. */
export function matching(reg: Registry, table: Table, viewer: Viewer, query: Query) {
  const s = select(reg, table, viewer, query);
  return { s, all: runQuery(reg, s.rows, { filter: s.filter, sorts: s.sorts, search: s.search, searchFields: s.searchFields }, s.env).records };
}

/** GET /registry/tables/:t/records */
export async function listRecords(tableRef: string | number, query: Query) {
  const { reg, table, viewer } = await open(tableRef);
  needReadable(reg, table, viewer);
  const s = select(reg, table, viewer, query);
  const limit = query.pageSize ?? query.limit ?? 100;
  const offset = query.page !== undefined ? (query.page - 1) * limit : (query.offset ?? 0);
  const result = runQuery(reg, s.rows, { filter: s.filter, sorts: s.sorts, groupBy: s.groupBy, aggregates: s.aggregates, search: s.search, searchFields: s.searchFields, offset, limit }, s.env);
  const permission = tablePermission(reg, table, viewer);
  const config = s.view?.config;
  const colored = config && (config.colorBy !== undefined || config.colors?.length);
  return {
    records: result.records.map((r) => {
      const record = out(reg, table, r, viewer, s.shown, query.fieldKey === "id");
      return colored ? { ...record, color: recordColor(reg, r, config, s.env) } : record;
    }),
    total: result.total,
    offset,
    limit,
    page: Math.floor(offset / Math.max(1, limit)) + 1,
    next: offset + limit < result.total ? Math.floor(offset / Math.max(1, limit)) + 2 : null,
    groups: result.groups?.map((g) => ({ ...g, aggregates: g.aggregates?.map((a) => ({ field: reg.field(a.field)!.name, fn: a.fn, value: a.value })) })),
    aggregates: result.aggregates?.map((a) => ({ field: reg.field(a.field)!.name, fn: a.fn, value: a.value })),
    fields: s.shown.map((f) => ({ id: f.id, name: f.name, type: f.type })),
    canCreate: atLeast(permission.level, "edit"),
  };
}

/** GET /registry/tables/:t/count: how many records match (NocoDB's count). */
export async function countRecords(tableRef: string | number, query: Query) {
  const { reg, table, viewer } = await open(tableRef);
  needReadable(reg, table, viewer);
  return { count: matching(reg, table, viewer, query).all.length };
}

/** GET /registry/tables/:t/records/:id/links/:field: the linked records, a page at a time, with a search. */
export async function listLinked(tableRef: string | number, recordId: number, fieldRef: string, query: { q?: string; limit: number; offset: number }) {
  const { reg, table, viewer } = await open(tableRef);
  const field = fieldOf(reg, table, fieldRef);
  if (field.type !== "link") throw invalid(`${field.name} is not a link`);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  const permission = needRecord(reg, table, record, viewer, "read");
  if (!permission.visible.has(field.id)) throw notFound("Field");
  const words = (query.q ?? "").toLowerCase().split(/\s+/).filter((w) => w !== "");
  const linked = reg.linkedIds(record, field).map((id) => ({ id, name: reg.display(id) })).filter((r) => words.every((w) => r.name.toLowerCase().includes(w)));
  return { records: linked.slice(query.offset, query.offset + query.limit), total: linked.length, offset: query.offset, limit: query.limit };
}

/**
 * GET /registry/tables/:t/names?view=: the records the person may see, by name only (the choices of a link);
 * with a view, only the ones it shows (a link limited to a view).
 */
export async function listNames(tableRef: string | number, viewRef?: string) {
  const { reg, table, viewer } = await open(tableRef);
  needReadable(reg, table, viewer);
  const view = viewRef ? viewOf(reg, table, viewRef) : undefined;
  const env = { today: reg.snapshot.today, peopleTableId: reg.snapshot.settings.peopleTableId, me: { email: viewer.email, personId: viewer.personId, userId: viewer.userId } };
  return visibleRecords(reg, table, viewer)
    .filter((r) => !view || matches(reg, r, view.config.filter, env))
    .map((r) => ({ id: r.id, name: reg.display(r.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

export function needReadable(reg: Registry, table: Table, viewer: Viewer) {
  if (visibleRecords(reg, table, viewer).length === 0 && !atLeast(tablePermission(reg, table, viewer).level, "read")) {
    if (!table.access.some((r) => r.who.kind === "self") && !viewer.isAdmin) throw forbidden("You cannot see this table");
  }
}

/** GET /registry/tables/:t/records/:id: the record, what may be changed in it, and the names of its links. */
export async function getRecord(tableRef: string | number, recordId: number) {
  const { reg, table, viewer } = await open(tableRef);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  const permission = needRecord(reg, table, record, viewer, "read");
  const fields = reg.fieldsOf(table.id).filter((f) => permission.visible.has(f.id));
  return {
    ...recordOut(reg, record, fields),
    canEdit: atLeast(permission.level, "edit"),
    writable: fields.filter((f) => permission.writable.has(f.id)).map((f) => f.name),
  };
}

/** The values typed by a client (by field name or id), normalized; only fields the viewer may write. */
function changesFrom(reg: Registry, table: Table, values: Record<string, unknown>, writable: Set<number>): Map<number, unknown> {
  const changes = new Map<number, unknown>();
  for (const [key, raw] of Object.entries(values)) {
    const field = fieldOf(reg, table, key);
    if (isComputed(field.type)) throw invalid(`${field.name} is worked out: it cannot be written`);
    if (!writable.has(field.id)) throw forbidden(`You cannot change ${field.name}`);
    const result = normalizeValue(field, raw);
    if (!result.ok) throw invalid(result.error);
    changes.set(field.id, result.value);
  }
  return changes;
}

async function reread(tableId: number, ids: number[]) {
  const reg = openRegistry(await loadRegistry(db, [tableId]));
  const table = tableOf(reg, tableId);
  const viewer = viewerOf(reg);
  return ids.map((id) => reg.record(id)).filter((r): r is RecordRow => r !== undefined).map((r) => out(reg, table, r, viewer, reg.fieldsOf(tableId)));
}

/** POST /registry/tables/:t/records: one record or many, all or none. */
export async function createRecords(tableRef: string | number, inputs: { fields: Record<string, unknown> }[]) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const permission = needTable(reg, table, viewer, "edit");
  const changes: RecordChange[] = inputs.map((i) => ({ values: changesFrom(reg, table, i.fields, permission.writable) }));
  const ids = await registryWrite(actor, "api", (w) => saveRecords(w, table.id, changes));
  return reread(table.id, ids);
}

/** PATCH /registry/tables/:t/records and /:id: changes, each with the version read before if given. */
export async function updateRecords(tableRef: string | number, inputs: { id: number; fields: Record<string, unknown>; version?: number }[]) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const changes: RecordChange[] = inputs.map((i) => {
    const record = reg.record(i.id);
    if (!record || record.tableId !== table.id) throw notFound("Record");
    const permission = needRecord(reg, table, record, viewer, "edit");
    return { id: i.id, version: i.version, values: changesFrom(reg, table, i.fields, permission.writable) };
  });
  const ids = await registryWrite(actor, "api", (w) => saveRecords(w, table.id, changes));
  return reread(table.id, ids);
}

/** The records of a bulk change: the ids given, or those a view, filter, where and search find. */
function bulkTargets(reg: Registry, table: Table, viewer: Viewer, input: z.infer<typeof bulkInput>): RecordRow[] {
  if (input.ids) return input.ids.map((id) => {
    const record = reg.record(id);
    if (!record || record.tableId !== table.id) throw notFound("Record");
    return record;
  });
  if (!input.view && !input.filter && !input.where && !input.q) throw invalid("Say which records: a view, a filter, a where, a search or the ids");
  return matching(reg, table, viewer, { view: input.view, filter: input.filter ? JSON.stringify(input.filter) : undefined, where: input.where, q: input.q }).all;
}

/** POST /registry/tables/:t/records/bulk-update: the same values in every record found, all or none. */
export async function bulkUpdate(tableRef: string | number, input: z.infer<typeof bulkInput>) {
  if (!input.fields || Object.keys(input.fields).length === 0) throw invalid("Say which fields to change");
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const targets = bulkTargets(reg, table, viewer, input);
  const changes: RecordChange[] = targets.map((r) => ({ id: r.id, values: changesFrom(reg, table, input.fields!, needRecord(reg, table, r, viewer, "edit").writable) }));
  if (changes.length > 0) await registryWrite(actor, "api", (w) => saveRecords(w, table.id, changes));
  return { updated: changes.length };
}

/** POST /registry/tables/:t/records/bulk-delete: deletes every record found. */
export async function bulkDelete(tableRef: string | number, input: z.infer<typeof bulkInput>) {
  const { reg, table, viewer } = await open(tableRef);
  const ids = bulkTargets(reg, table, viewer, input).map((r) => r.id);
  if (ids.length > 0) await removeRecords(table.id, ids);
  return { deleted: ids.length };
}

/** POST /registry/tables/:t/records/upsert: changes the records with the same values of `match`, adds the others. */
export async function upsertRecords(tableRef: string | number, input: z.infer<typeof upsertInput>) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const keys = input.match.map((ref) => fieldOf(reg, table, ref));
  const keyOf = (texts: string[]) => texts.map((t) => t.trim().toLowerCase()).join("\u0001");
  const existing = new Map(visibleRecords(reg, table, viewer).map((r) => [keyOf(keys.map((k) => textOf(reg.value(r, k)))), r]));
  let updated = 0;
  const changes: RecordChange[] = input.records.map((item) => {
    const texts = keys.map((k) => {
      const entry = Object.entries(item.fields).find(([key]) => key === String(k.id) || key.toLowerCase() === k.name.toLowerCase());
      const result = entry ? normalizeValue(k, entry[1]) : null;
      if (!result?.ok || textOf(result.value) === "") throw invalid(`Every record needs ${keys.map((x) => x.name).join(" and ")}`);
      return textOf(result.value);
    });
    const found = existing.get(keyOf(texts));
    if (found) updated++;
    const writable = found ? needRecord(reg, table, found, viewer, "edit").writable : needTable(reg, table, viewer, "edit").writable;
    return found ? { id: found.id, values: changesFrom(reg, table, item.fields, writable) } : { values: changesFrom(reg, table, item.fields, writable) };
  });
  const ids = await registryWrite(actor, "api", (w) => saveRecords(w, table.id, changes));
  return { records: await reread(table.id, ids), created: changes.length - updated, updated };
}

/** POST /registry/tables/:t/records/:id/duplicate: a copy of a record (values and links; not its files). */
export async function duplicateRecord(tableRef: string | number, recordId: number) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  needRecord(reg, table, record, viewer, "read");
  const permission = needTable(reg, table, viewer, "edit");
  const values = new Map<number, unknown>();
  for (const f of reg.fieldsOf(table.id)) {
    if (!permission.writable.has(f.id) || isComputed(f.type) || f.type === "attachment" || f.unique) continue;
    if (f.type === "link") {
      // a link that holds one record on the other side would be taken away from this record: it stays out
      const inverse = f.options.inverseId === undefined ? undefined : reg.field(f.options.inverseId);
      if (inverse && !inverse.options.multiple) continue;
      const ids = reg.linkedIds(record, f);
      if (ids.length) values.set(f.id, ids);
    } else if (isStored(f.type) && record.data[String(f.id)] !== undefined) values.set(f.id, record.data[String(f.id)]);
  }
  const [id] = await registryWrite(actor, "api", (w) => saveRecords(w, table.id, [{ values }]));
  return (await reread(table.id, [id!]))[0];
}

/** DELETE /registry/tables/:t/records/:id and ?ids= */
export async function removeRecords(tableRef: string | number, ids: number[]) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  for (const id of ids) {
    const record = reg.record(id);
    if (!record || record.tableId !== table.id) throw notFound("Record");
    needRecord(reg, table, record, viewer, "edit");
  }
  await registryWrite(actor, "api", (w) => deleteRecords(w, table.id, ids));
}

/** POST and DELETE /registry/tables/:t/records/:id/links/:field: adds or takes away linked records. */
export async function changeLinks(tableRef: string | number, recordId: number, fieldRef: string, ids: number[], add: boolean) {
  const { reg, table } = await open(tableRef);
  const field = fieldOf(reg, table, fieldRef);
  if (field.type !== "link") throw invalid(`${field.name} is not a link`);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  const now = reg.linkedIds(record, field);
  const next = add ? [...now, ...ids.filter((id) => !now.includes(id))] : now.filter((id) => !ids.includes(id));
  return (await updateRecords(tableRef, [{ id: recordId, fields: { [String(field.id)]: next } }]))[0];
}

/** Whether a file of type `mime` is accepted by a field (`image/*` style patterns); no list: anything. */
export function accepts(field: Field, mime: string): boolean {
  const list = field.options.accept ?? [];
  if (list.length === 0) return true;
  return list.some((p) => (p.endsWith("/*") ? mime.startsWith(p.slice(0, -1)) : p.toLowerCase() === mime.toLowerCase()));
}

export const fileLimitBytes = (field: Field) => (field.options.maxSizeMb ?? 10) * 1_000_000;

/** POST /registry/tables/:t/records/:id/files/:field: attaches a file (the body is the file). */
export async function uploadFile(tableRef: string | number, recordId: number, fieldRef: string, name: string, mime: string, bytes: unknown) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const field = fieldOf(reg, table, fieldRef);
  if (field.type !== "attachment") throw invalid(`${field.name} does not hold files`);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  const permission = needRecord(reg, table, record, viewer, "edit");
  if (!permission.writable.has(field.id)) throw forbidden(`You cannot change ${field.name}`);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw invalid("Send the file itself");
  checkFile(field, name, mime, bytes.length);
  const current = ((record.data[String(field.id)] as number[] | undefined) ?? []).map(Number);
  if (current.length >= (field.options.maxFiles ?? 20)) throw invalid(`${field.name}: at most ${field.options.maxFiles ?? 20} files`);
  await registryWrite(actor, "api", async (w) => {
    const [file] = await w.tx.insert(regFile).values({ recordId, fieldId: field.id, name, mime, sizeBytes: bytes.length, data: bytes, uploadedBy: actor.id }).returning({ id: regFile.id });
    await saveRecords(w, table.id, [{ id: recordId, values: new Map([[field.id, [...current, file!.id]]]) }]);
  });
  return (await reread(table.id, [recordId]))[0];
}

/** The checks of a file before it is kept: size and type. */
export function checkFile(field: Field, name: string, mime: string, size: number) {
  if (size > fileLimitBytes(field)) throw invalid(`${field.name}: a file can be at most ${field.options.maxSizeMb ?? 10} MB`);
  if (!accepts(field, mime)) throw invalid(`${field.name}: ${name} is not of an accepted type`);
}

/** The types the browser may show by itself; anything else is downloaded, never opened as a page of the site. */
const INLINE = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  "image/gif": (b) => b.subarray(0, 3).toString("latin1") === "GIF",
  "image/webp": (b) => b.subarray(8, 12).toString("latin1") === "WEBP",
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
};

/** How to send a file: shown in the page only if it really is what it says (an image or a PDF). */
export function disposition(name: string, mime: string, bytes: Buffer) {
  const inline = INLINE.includes(mime) && MAGIC[mime]!(bytes);
  return { inline, type: inline ? mime : "application/octet-stream", header: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}` };
}

/** The file, its record and field, and what the person asking may do with that record. */
async function fileContext(fileId: number) {
  const [meta] = await db
    .select({ recordId: regFile.recordId, fieldId: regFile.fieldId, tableId: regField.tableId })
    .from(regFile)
    .innerJoin(regField, eq(regField.id, regFile.fieldId))
    .where(eq(regFile.id, fileId));
  if (!meta) throw notFound("File");
  const reg = openRegistry(await loadRegistry(db, [meta.tableId]));
  const table = tableOf(reg, meta.tableId);
  const record = reg.record(meta.recordId);
  const field = reg.field(meta.fieldId);
  if (!record || !field) throw notFound("File");
  return { reg, table, record, field, permission: recordPermission(reg, table, record, viewerOf(reg)) };
}

/** GET /registry/files/:id: a file, for who may see the field it is in. */
export async function getFile(fileId: number) {
  const { field, permission } = await fileContext(fileId);
  if (!permission.visible.has(field.id)) throw notFound("File");
  return readFile(fileId);
}

/** The bytes of a file (the only place that reads them). */
export async function readFile(fileId: number) {
  const [file] = await db.select({ name: regFile.name, mime: regFile.mime, data: regFile.data }).from(regFile).where(eq(regFile.id, fileId));
  if (!file) throw notFound("File");
  return file;
}

/** DELETE /registry/files/:id: takes the file out of its field (and deletes it). */
export async function removeFile(fileId: number) {
  const { table, record, field, permission } = await fileContext(fileId);
  if (!permission.visible.has(field.id)) throw notFound("File");
  const next = ((record.data[String(field.id)] as number[] | undefined) ?? []).map(Number).filter((id) => id !== fileId);
  await updateRecords(table.id, [{ id: record.id, fields: { [String(field.id)]: next } }]);
}

/** POST /registry/tables/:t/records/:id/buttons/:field: sends the record to the webhook of the button. */
export async function pressButton(tableRef: string | number, recordId: number, fieldRef: string) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const field = fieldOf(reg, table, fieldRef);
  if (field.type !== "button") throw invalid(`${field.name} is not a button`);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  if (field.options.url) {
    needRecord(reg, table, record, viewer, "read");
    const url = textOf(reg.value(record, field)).trim();
    // only web addresses: never javascript: or data: from a formula
    if (!/^https?:\/\/\S+$/i.test(url)) throw invalid(`${field.name}: the formula does not make a web address`);
    return { url };
  }
  needRecord(reg, table, record, viewer, "edit");
  const hookId = field.options.webhookId;
  const [hook] = hookId ? await db.select({ id: regWebhook.id }).from(regWebhook).where(and(eq(regWebhook.id, hookId), eq(regWebhook.tableId, table.id), eq(regWebhook.active, true))) : [];
  if (!hook) throw new AppError(409, `${field.name} is not connected to an active webhook`);
  await registryWrite(actor, `button:${field.name}`, (w) => queueWebhooks(w, table.id, reg, [{ id: recordId, before: record, event: "button" }], hook.id));
  return { url: null };
}

/** GET /registry/tables/:t/records/:id/history: what changed and who did it, only in the fields the viewer sees. */
export async function recordHistory(tableRef: string | number, recordId: number) {
  const { reg, table, viewer } = await open(tableRef);
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  const permission = needRecord(reg, table, record, viewer, "read");
  const rows = await db
    .select({ id: auditLog.id, at: auditLog.at, actor: appUser.name, tableName: auditLog.tableName, action: auditLog.action, before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .leftJoin(appUser, eq(appUser.id, auditLog.actorId))
    .where(
      or(
        and(eq(auditLog.tableName, "reg_record"), eq(auditLog.rowId, recordId)),
        and(
          eq(auditLog.tableName, "reg_link"),
          sql`(${auditLog.after}->>'record_id' = ${String(recordId)} or ${auditLog.after}->>'target_id' = ${String(recordId)} or ${auditLog.before}->>'record_id' = ${String(recordId)} or ${auditLog.before}->>'target_id' = ${String(recordId)})`,
        ),
      ),
    )
    .orderBy(desc(auditLog.id))
    .limit(300);
  const visible = (id: number) => permission.visible.has(id);
  return rows.flatMap((row) => {
    const base = { at: row.at instanceof Date ? row.at.toISOString() : String(row.at), actor: row.actor ?? "system", action: row.action };
    if (row.tableName === "reg_link") {
      const l = (row.after ?? row.before) as { field_id: number; record_id: number; target_id: number };
      const owner = reg.field(l.field_id);
      const mine = l.record_id === recordId ? owner : owner?.options.inverseId !== undefined ? reg.field(owner.options.inverseId) : undefined;
      if (!mine || !visible(mine.id)) return [];
      const other = l.record_id === recordId ? l.target_id : l.record_id;
      return [{ ...base, action: row.action === "delete" ? "unlink" : "link", changes: [{ field: mine.name, before: null, after: reg.display(other) }] }];
    }
    const before = ((row.before as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
    const after = ((row.after as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changes = keys
      .map((k) => reg.field(Number(k)))
      .filter((f): f is Field => f !== undefined && visible(f.id) && JSON.stringify(before[String(f.id)] ?? null) !== JSON.stringify(after[String(f.id)] ?? null))
      .map((f) => ({ field: f.name, before: before[String(f.id)] ?? null, after: after[String(f.id)] ?? null }));
    if (row.action === "update" && changes.length === 0) return [];
    return [{ ...base, changes }];
  });
}

/** POST /registry/tables/:t/import: checks a CSV (dry run) or loads it, all rows or none. */
export async function importCsv(tableRef: string | number, input: z.infer<typeof importInput>) {
  const actor = await getCurrentUser();
  const { reg, table, viewer } = await open(tableRef);
  const permission = needTable(reg, table, viewer, "edit");
  const [header, ...lines] = parseCsv(input.csv);
  if (!header) throw invalid("The file is empty");
  const columns = header.map((name) => {
    const field = reg.findField(table.id, name.trim());
    return field && !isComputed(field.type) && field.type !== "attachment" && permission.writable.has(field.id) ? field : undefined;
  });
  const ignored = header.filter((_, i) => !columns[i]);
  const key = input.mode === "upsert" ? fieldOf(reg, table, input.key ?? "") : undefined;
  if (input.mode === "upsert" && (!key || !columns.includes(key))) throw invalid("Upsert needs a key column that is in the file");

  const errors: { row: number; message: string }[] = [];
  const changes: RecordChange[] = [];
  let updates = 0;
  lines.forEach((cells, index) => {
    const row = index + 2;
    const values = new Map<number, unknown>();
    columns.forEach((field, i) => {
      if (!field) return;
      let raw = fromText(field.type, cells[i] ?? "");
      if (field.type === "link" && Array.isArray(raw)) {
        const targets = reg.recordsOf(field.options.tableId ?? 0);
        raw = raw.map((name) => {
          const found = targets.find((t) => reg.display(t.id).toLowerCase() === String(name).toLowerCase() || String(t.id) === String(name));
          if (!found) errors.push({ row, message: `${field.name}: no record called "${String(name)}"` });
          return found?.id ?? 0;
        }).filter((id) => id !== 0);
      }
      if (field.type === "user" && Array.isArray(raw)) {
        raw = raw.map((who) => {
          const text = String(who).trim().toLowerCase();
          const found = reg.snapshot.users.find((u) => u.email.toLowerCase() === text || u.name.toLowerCase() === text || String(u.id) === text);
          if (!found) errors.push({ row, message: `${field.name}: no user "${String(who)}"` });
          return found?.id ?? 0;
        }).filter((id) => id !== 0);
      }
      const result = normalizeValue(field, raw);
      if (result.ok) values.set(field.id, result.value);
      else errors.push({ row, message: result.error });
    });
    const existing = key ? reg.recordsOf(table.id).find((r) => String(textOf(reg.value(r, key))).toLowerCase() === String(textOf(values.get(key.id))).toLowerCase() && textOf(values.get(key.id)) !== "") : undefined;
    if (existing) {
      if (!atLeast(recordPermission(reg, table, existing, viewer).level, "edit")) errors.push({ row, message: "You cannot change the record it matches" });
      updates++;
    }
    changes.push(existing ? { id: existing.id, values } : { values });
  });

  const summary = { rows: lines.length, create: changes.length - updates, update: updates, ignoredColumns: ignored, errors: errors.slice(0, 200) };
  if (input.dryRun || errors.length > 0) return { ...summary, saved: false };
  if (changes.length > 0) await registryWrite(actor, "import", (w) => saveRecords(w, table.id, changes));
  return { ...summary, saved: true };
}
