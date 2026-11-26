import { createHmac, randomUUID } from "node:crypto";
import {
  defaultOf, isComputed, isEmptyValue, isStored, matches, normalizeValue, openRegistry, ownerOf, renderTemplate, textOf, withDraft,
  type Field, type Filter, type RecordRow, type Registry, type RegistrySnapshot,
} from "@erp/registry";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { conflict, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { regFile, regLink, regRecord, regTable, regWebhook, regWebhookLog } from "../../db/schema";
import type { User } from "../../platform/auth/auth.service";
import { loadRegistry } from "./registry.data";

// The one way records are written, whoever writes them (the grid, the API, a form, an import): links and
// files checked, unique and required values, the rows saved, and afterwards the webhooks told.

/** What other modules may listen to: something of the registry changed, inside the same transaction. */
export type RegistryListener = (tx: Tx, change: { tableIds: number[] }) => Promise<void>;
const listeners: RegistryListener[] = [];

/** Called by modules that depend on the registry (rolesync): they run in the transaction of the change. */
export function onRegistryChange(listener: RegistryListener) {
  listeners.push(listener);
}

/**
 * What another module answers when a field or a view of the registry is about to go: what of its own uses it
 * ("the areas of the roles of the ERP"), or null. The registry asks without knowing who answers.
 */
export type RegistryUseCheck = (what: { fieldIds?: number[]; viewId?: number }) => Promise<string | null>;
const useChecks: RegistryUseCheck[] = [];

export function onRegistryUse(check: RegistryUseCheck) {
  useChecks.push(check);
}

/** The first thing outside the registry that uses these fields or this view, or null. */
export async function usedOutside(what: { fieldIds?: number[]; viewId?: number }): Promise<string | null> {
  for (const check of useChecks) {
    const user = await check(what);
    if (user) return user;
  }
  return null;
}

/** How a webhook is called, besides its address (reg_webhook.options; docs/anagrafiche.md, §10.4). */
export interface WebhookOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  /** A template of the body ({{record.fields.Name}}, {{json record}}): without it, the whole event as JSON. */
  body?: string;
  /** An update counts only if one of these fields changed. */
  fields?: number[];
  /** "matches": every change of a record that matches the filter; "becomes": only when it starts matching (NocoDB). */
  when?: "matches" | "becomes";
}

interface Delivery {
  webhookId: number;
  url: string;
  secret: string;
  event: string;
  recordId: number | null;
  body: string;
  method: string;
  headers: Record<string, string>;
}

export interface Writer {
  tx: Tx;
  actor: User | null;
  /** Where the change comes from, for the webhooks: "api", "form:<slug>", "import". */
  source: string;
  touched: Set<number>;
  deliveries: Delivery[];
}

/**
 * Runs `fn` in one transaction as `actor` (null: somebody filling in a public form), lets the listeners see
 * the change before it is saved, and calls the webhooks once it is.
 */
export async function registryWrite<T>(actor: User | null, source: string, fn: (w: Writer) => Promise<T>): Promise<T> {
  const deliveries: Delivery[] = [];
  const run = async (tx: Tx) => {
    const w: Writer = { tx, actor, source, touched: new Set(), deliveries };
    const result = await fn(w);
    if (w.touched.size > 0) for (const listener of listeners) await listener(tx, { tableIds: [...w.touched] });
    return result;
  };
  const result = actor ? await runWrite(actor, run) : await db.transaction(run);
  for (const d of deliveries) void deliver(d);
  return result;
}

/** One writer at a time per table: the checks of unique values see every other change. */
export async function lockTable(tx: Tx, tableId: number) {
  const [row] = await tx.select({ id: regTable.id }).from(regTable).where(eq(regTable.id, tableId)).for("update");
  if (!row) throw notFound("Table");
}

/** A record as the API, the webhooks and the CSV show it: the values of the fields given, by name (or by id). */
export function recordOut(reg: Registry, record: RecordRow, fields: Field[], byId = false) {
  return {
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fields: Object.fromEntries(fields.map((f) => [byId ? String(f.id) : f.name, reg.output(record, f)])),
  };
}

export interface RecordChange {
  /** Missing: a new record. */
  id?: number;
  /** The values to write, already normalized, by field id; null empties a field. */
  values: Map<number, unknown>;
  version?: number;
}

const uniqueKey = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : JSON.stringify(v));

/**
 * A new record gets a fresh uuid in its uuid fields, and the default of every field it was not given (a value
 * emptied on purpose stays empty, as in NocoDB).
 */
function addDefaults(w: Writer, reg: Registry, snapshot: RegistrySnapshot, fields: Field[], change: RecordChange, draft: RecordRow) {
  const ctx = { today: snapshot.today, now: snapshot.now, userId: w.actor?.id ?? null, email: w.actor?.email ?? null };
  for (const f of fields) {
    if (f.type === "uuid") draft.data[String(f.id)] = randomUUID();
    if (change.values.has(f.id) || !isStored(f.type) || isComputed(f.type)) continue;
    const d = defaultOf(f, ctx);
    if (d === undefined) continue;
    const result = normalizeValue(f, d);
    // a default that no longer fits (a choice renamed since) is left out rather than stopping the record
    if (result.ok && result.value !== null && !(f.type === "user" && !(result.value as number[]).every((id) => reg.snapshot.users.some((u) => u.id === id)))) change.values.set(f.id, result.value);
  }
}

/** Saves new and changed records of one table. Returns their ids, in the order of `changes`. */
export async function saveRecords(w: Writer, tableId: number, changes: RecordChange[]): Promise<number[]> {
  await lockTable(w.tx, tableId);
  const snapshot = await loadRegistry(w.tx, [tableId]);
  const reg = openRegistry(snapshot);
  const fields = reg.fieldsOf(tableId);

  // every change as a draft, checked against the others and the records already there
  let working: RegistrySnapshot = snapshot;
  const drafts: { change: RecordChange; base: RecordRow | null; draft: RecordRow }[] = [];
  changes.forEach((change, index) => {
    const base = change.id === undefined ? null : (reg.record(change.id) ?? null);
    if (change.id !== undefined && (!base || base.tableId !== tableId)) throw notFound("Record");
    if (base && change.version !== undefined && change.version !== base.version) throw conflict("Someone else changed this record in the meantime: reload it and try again");
    const draft: RecordRow = base
      ? { ...base, data: { ...base.data } }
      : { id: -(index + 1), tableId, data: {}, version: 0, createdAt: snapshot.now, createdBy: w.actor?.id ?? null, updatedAt: snapshot.now, updatedBy: w.actor?.id ?? null };
    const links: Record<number, number[]> = {};
    if (!base) addDefaults(w, reg, snapshot, fields, change, draft);
    for (const [fieldId, value] of change.values) {
      const field = reg.field(fieldId);
      if (!field || field.tableId !== tableId || isComputed(field.type)) throw invalid("A field that cannot be written");
      if (field.type === "user") {
        for (const id of (value as number[] | null) ?? []) if (!reg.snapshot.users.some((u) => u.id === id)) throw invalid(`${field.name}: there is no user #${id}`);
      }
      if (field.type === "link") {
        const ids = (value as number[] | null) ?? [];
        for (const id of ids) if (reg.record(id)?.tableId !== field.options.tableId) throw invalid(`${field.name}: there is no record #${id} to link`);
        links[fieldId] = ids;
      } else {
        if (field.type === "attachment") {
          for (const id of (value as number[] | null) ?? []) {
            const file = reg.file(id);
            if (!file || file.recordId !== base?.id || file.fieldId !== field.id) throw invalid(`${field.name}: file #${id} is not one of this field's`);
          }
        }
        if (value === null || (Array.isArray(value) && value.length === 0)) delete draft.data[String(fieldId)];
        else draft.data[String(fieldId)] = value;
      }
    }
    working = withDraft(working, draft, links);
    drafts.push({ change, base, draft });
  });

  const after = openRegistry(working);
  const changedIds = new Set(drafts.map((d) => d.draft.id));
  for (const f of fields.filter((x) => x.unique)) {
    const seen = new Map<string, number>();
    for (const r of after.recordsOf(tableId)) {
      const v = after.value(r, f);
      if (isEmptyValue(v)) continue;
      const key = uniqueKey(v);
      const other = seen.get(key);
      if (other !== undefined && (changedIds.has(r.id) || changedIds.has(other))) throw conflict(`${f.name}: "${textOf(v)}" is already used by another record`);
      seen.set(key, r.id);
    }
  }
  for (const { change, base, draft } of drafts) {
    const record = after.record(draft.id)!;
    for (const f of fields) {
      // a new record needs every required field; a change cannot empty one (older empty values may stay)
      if (!f.required || isComputed(f.type) || (base && !change.values.has(f.id))) continue;
      const v = after.value(record, f);
      if (isEmptyValue(v) || (f.type === "checkbox" && v === false)) throw invalid(`${f.name} is required`);
    }
  }

  // save: the records, then their links, then the files that are no longer in their fields
  const ids: number[] = [];
  for (const { change, base, draft } of drafts) {
    let id: number;
    if (base) {
      await w.tx
        .update(regRecord)
        .set({ data: draft.data, version: sql`${regRecord.version} + 1`, updatedAt: new Date(), updatedBy: w.actor?.id ?? null })
        .where(eq(regRecord.id, base.id));
      id = base.id;
    } else {
      const [row] = await w.tx.insert(regRecord).values({ tableId, data: draft.data, createdBy: w.actor?.id ?? null, updatedBy: w.actor?.id ?? null }).returning({ id: regRecord.id });
      id = row!.id;
    }
    ids.push(id);
    for (const [fieldId, value] of change.values) {
      const field = reg.field(fieldId)!;
      if (field.type === "link") await replaceLinks(w.tx, reg, field, id, (value as number[] | null) ?? []);
      if (field.type === "attachment" && base) {
        const kept = new Set(((value as number[] | null) ?? []).map(Number));
        const before = ((base.data[String(fieldId)] as number[] | undefined) ?? []).map(Number).filter((f) => !kept.has(f));
        if (before.length) await w.tx.delete(regFile).where(and(eq(regFile.recordId, id), inArray(regFile.id, before)));
      }
    }
  }
  w.touched.add(tableId);
  await queueWebhooks(w, tableId, reg, ids.map((id, i) => ({ id, before: drafts[i]!.base, event: drafts[i]!.base ? "update" : "create" })));
  return ids;
}

/** The links of one record in one link field become `targets` (in order), keeping single links single on both sides. */
async function replaceLinks(tx: Tx, reg: Registry, field: Field, recordId: number, targets: number[]) {
  const owner = reg.field(ownerOf(field))!;
  const inverse = owner.options.inverseId !== undefined ? reg.field(owner.options.inverseId) : undefined;
  const ownerSide = owner.id === field.id;
  await tx.delete(regLink).where(and(eq(regLink.fieldId, owner.id), ownerSide ? eq(regLink.recordId, recordId) : eq(regLink.targetId, recordId)));
  if (targets.length === 0) return;
  if (ownerSide && inverse && !inverse.options.multiple) {
    // the records linked here can be linked by this record only
    await tx.delete(regLink).where(and(eq(regLink.fieldId, owner.id), inArray(regLink.targetId, targets), ne(regLink.recordId, recordId)));
  }
  if (!ownerSide && !owner.options.multiple) {
    // each record on the owning side holds one link only: this one replaces the one it had
    await tx.delete(regLink).where(and(eq(regLink.fieldId, owner.id), inArray(regLink.recordId, targets), ne(regLink.targetId, recordId)));
  }
  await tx
    .insert(regLink)
    .values(targets.map((t, position) => (ownerSide ? { fieldId: owner.id, recordId, targetId: t, position } : { fieldId: owner.id, recordId: t, targetId: recordId, position: 0 })))
    .onConflictDoNothing();
}

/** Deletes records of one table (with their links and files). */
export async function deleteRecords(w: Writer, tableId: number, ids: number[]) {
  await lockTable(w.tx, tableId);
  const reg = openRegistry(await loadRegistry(w.tx, [tableId]));
  for (const id of ids) if (reg.record(id)?.tableId !== tableId) throw notFound("Record");
  await queueWebhooks(w, tableId, reg, ids.map((id) => ({ id, before: reg.record(id)!, event: "delete" })));
  await w.tx.delete(regRecord).where(inArray(regRecord.id, ids));
  w.touched.add(tableId);
}

/** Whether the values of these fields differ between two versions of a record. */
function changedIn(reg: Registry, before: RecordRow, after: Registry, now: RecordRow, fields: number[]): boolean {
  return fields.some((id) => {
    const f = reg.field(id);
    return f !== undefined && JSON.stringify(reg.output(before, f) ?? null) !== JSON.stringify(after.output(now, f) ?? null);
  });
}

/**
 * Tells the webhooks of the table about these records, once they are saved. A button calls only its own
 * webhook (`onlyHook`), whatever events that one listens to.
 */
export async function queueWebhooks(w: Writer, tableId: number, before: Registry, items: { id: number; before: RecordRow | null; event: string; extra?: Record<string, unknown> }[], onlyHook?: number) {
  const all = await w.tx.select().from(regWebhook).where(and(eq(regWebhook.tableId, tableId), eq(regWebhook.active, true)));
  const hooks = onlyHook !== undefined ? all.filter((h) => h.id === onlyHook).map((h) => ({ ...h, events: [...h.events, "button"] })) : all.filter((h) => items.some((i) => h.events.includes(i.event)));
  if (hooks.length === 0) return;
  const after = items.some((i) => i.event !== "delete") ? openRegistry(await loadRegistry(w.tx, [tableId])) : before;
  const table = after.table(tableId) ?? before.table(tableId)!;
  const env = { today: after.snapshot.today, peopleTableId: after.snapshot.settings.peopleTableId };
  for (const item of items) {
    const now = item.event === "delete" ? undefined : after.record(item.id);
    const record = now ? recordOut(after, now, after.fieldsOf(tableId)) : null;
    const previous = item.before ? recordOut(before, item.before, before.fieldsOf(tableId)) : null;
    for (const hook of hooks) {
      if (!hook.events.includes(item.event)) continue;
      const options = hook.options as WebhookOptions;
      // a button is pressed on purpose: the filter and the fields of the webhook are for the changes, not for it
      if (item.event !== "button") {
        const filter = hook.filter as Filter | null;
        const matchesNow = !filter || (now ? matches(after, now, filter, env) : item.before ? matches(before, item.before, filter, env) : true);
        if (!matchesNow) continue;
        // "becomes": an update counts only when the record did not match before
        if (filter && options.when === "becomes" && item.event === "update" && item.before && matches(before, item.before, filter, env)) continue;
        if (item.event === "update" && options.fields?.length && item.before && now && !changedIn(before, item.before, after, now, options.fields)) continue;
      }
      const event = { event: item.event, table: { id: table.id, name: table.name }, record: record ?? previous, previous: item.event === "create" ? null : previous, ...item.extra, source: w.source, actor: w.actor ? { email: w.actor.email, name: w.actor.name } : null, at: new Date().toISOString() };
      let body: string;
      try {
        body = options.body ? renderTemplate(options.body, event) : JSON.stringify(event);
      } catch {
        body = JSON.stringify(event);
      }
      w.deliveries.push({ webhookId: hook.id, url: hook.url, secret: hook.secret, event: item.event, recordId: item.id, body, method: options.method ?? "POST", headers: options.headers ?? {} });
    }
  }
}

/** The signature n8n checks: `sha256=` and the HMAC of the body with the secret of the webhook. */
export const signature = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Calls one webhook (after the change is saved): ten seconds at most; the outcome goes to its log. */
export async function deliver(d: Delivery): Promise<void> {
  let status: number | null = null;
  let error: string | null = null;
  try {
    const withBody = d.method !== "GET";
    // the headers of the person first, ours after: the signature cannot be replaced
    const headers = { "Content-Type": "application/json", ...d.headers, "X-Registry-Signature": signature(d.secret, withBody ? d.body : ""), "X-Registry-Event": d.event };
    const response = await fetch(d.url, {
      method: d.method,
      headers,
      ...(withBody ? { body: d.body } : {}),
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    });
    status = response.status;
    if (!response.ok) error = `Answered ${response.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 500) : "Failed";
  }
  try {
    await db.insert(regWebhookLog).values({ webhookId: d.webhookId, event: d.event, recordId: d.recordId, status, error });
    // the log keeps the last 200 calls of each webhook
    await db.execute(sql`delete from reg_webhook_log where webhook_id = ${d.webhookId} and id not in (select id from reg_webhook_log where webhook_id = ${d.webhookId} order by id desc limit 200)`);
  } catch {
    // the webhook was deleted meanwhile: nothing to log
  }
}
