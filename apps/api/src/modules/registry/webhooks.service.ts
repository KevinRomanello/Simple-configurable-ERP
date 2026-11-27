import { randomBytes } from "node:crypto";
import { checkTemplate, renderTemplate, TemplateError, type Registry, type Table } from "@erp/registry";
import { and, asc, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { conflict, invalid, notFound } from "../../core/errors";
import { db } from "../../db/client";
import { regWebhook, regWebhookLog } from "../../db/schema/registry";
import { fieldOf, filterFrom } from "./registry.access";
import type { webhookInput } from "./registry.schema";
import { deliver, registryWrite, signature, type WebhookOptions } from "./registry.write";
import { managed } from "./schema.service";

// The webhooks of a table (docs/anagrafiche.md, §10.4): who to tell when records change, how (method,
// headers, a template of the body) and when; their log, a test call and a copy. For who manages the table.

/** GET /registry/tables/:t/webhooks */
export async function listWebhooks(tableRef: string | number) {
  const { reg, table } = await managed(tableRef);
  const rows = await db.select().from(regWebhook).where(eq(regWebhook.tableId, table.id)).orderBy(asc(regWebhook.id));
  return rows.map((row) => webhookOut(reg, row));
}

/** POST /registry/tables/:t/webhooks: the secret that signs the calls is made here. */
export async function createWebhook(tableRef: string | number, input: z.infer<typeof webhookInput>) {
  const { reg, table, actor } = await managed(tableRef);
  const filter = input.filter ? filterFrom(reg, table, input.filter, null) : null;
  const options = webhookOptionsFrom(reg, table, input);
  const [row] = await registryWrite(actor, "api", (w) =>
    w.tx.insert(regWebhook).values({ tableId: table.id, name: input.name, url: input.url, events: input.events, filter, options, secret: randomBytes(24).toString("hex"), active: input.active ?? true }).returning(),
  );
  return webhookOut(reg, row!);
}

/** How a webhook is called, as sent by a client: fields by name, the template checked. */
function webhookOptionsFrom(reg: Registry, table: Table, input: Partial<z.infer<typeof webhookInput>>, current: WebhookOptions = {}): WebhookOptions {
  const options: WebhookOptions = { ...current };
  if (input.method !== undefined) options.method = input.method;
  if (input.headers !== undefined) options.headers = input.headers;
  if (input.when !== undefined) options.when = input.when;
  if (input.fields !== undefined) options.fields = input.fields.map((ref) => fieldOf(reg, table, ref).id);
  if (input.body !== undefined) {
    if (input.body === null || input.body === "") delete options.body;
    else {
      try {
        checkTemplate(input.body);
      } catch (error) {
        throw invalid(error instanceof TemplateError ? `Body: ${error.message}` : "The body cannot be read");
      }
      options.body = input.body;
    }
  }
  return options;
}

/** A webhook as the site shows it: its options with the names of the fields. */
function webhookOut(reg: Registry, row: typeof regWebhook.$inferSelect) {
  const options = row.options as WebhookOptions;
  return { ...row, options: { ...options, fields: options.fields?.map((id) => reg.field(id)?.name ?? `#${id}`) } };
}

/** GET /registry/webhooks/:id */
export async function getWebhook(id: number) {
  const { hook, reg } = await webhookOf(id);
  return webhookOut(reg, hook);
}

async function webhookOf(id: number) {
  const [hook] = await db.select().from(regWebhook).where(eq(regWebhook.id, id));
  if (!hook) throw notFound("Webhook");
  return { hook, ...(await managed(hook.tableId)) };
}

/** PATCH /registry/webhooks/:id */
export async function updateWebhook(id: number, patch: Partial<z.infer<typeof webhookInput>>) {
  const { reg, table, actor, hook } = await webhookOf(id);
  const changes: Partial<typeof regWebhook.$inferInsert> = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.url !== undefined) changes.url = patch.url;
  if (patch.events !== undefined) changes.events = patch.events;
  if (patch.active !== undefined) changes.active = patch.active;
  if (patch.filter !== undefined) changes.filter = patch.filter ? filterFrom(reg, table, patch.filter, null) : null;
  changes.options = webhookOptionsFrom(reg, table, patch, hook.options as WebhookOptions);
  const [row] = await registryWrite(actor, "api", (w) => w.tx.update(regWebhook).set(changes).where(eq(regWebhook.id, id)).returning());
  return webhookOut(reg, row!);
}

/** DELETE /registry/webhooks/:id: refused while a button calls it. */
export async function deleteWebhook(id: number) {
  const { reg, actor } = await webhookOf(id);
  const button = reg.snapshot.fields.find((f) => f.type === "button" && f.options.webhookId === id);
  if (button) throw conflict(`The button ${button.name} calls this webhook: change it first`);
  await registryWrite(actor, "api", (w) => w.tx.delete(regWebhook).where(eq(regWebhook.id, id)));
}

/** GET /registry/webhooks/:id/log: the last calls, the latest first. */
export async function webhookLog(id: number) {
  await webhookOf(id);
  return db.select().from(regWebhookLog).where(eq(regWebhookLog.webhookId, id)).orderBy(desc(regWebhookLog.id)).limit(50);
}

/** POST /registry/webhooks/:id/test: calls it now with an example and says how it went. */
export async function testWebhook(id: number) {
  const { hook, table } = await webhookOf(id);
  const event = { event: "test", table: { id: table.id, name: table.name }, record: null, previous: null, source: "test", actor: null, at: new Date().toISOString() };
  const options = hook.options as WebhookOptions;
  let body: string;
  try {
    body = options.body ? renderTemplate(options.body, event) : JSON.stringify(event);
  } catch {
    body = JSON.stringify(event);
  }
  await deliver({ webhookId: hook.id, url: hook.url, secret: hook.secret, event: "test", recordId: null, body, method: options.method ?? "POST", headers: options.headers ?? {} });
  const [last] = await db.select().from(regWebhookLog).where(and(eq(regWebhookLog.webhookId, id))).orderBy(desc(regWebhookLog.id)).limit(1);
  return { status: last?.status ?? null, error: last?.error ?? null, signature: signature(hook.secret, body) };
}

/** POST /registry/webhooks/:id/duplicate: the same webhook, off, with a secret of its own. */
export async function duplicateWebhook(id: number) {
  const { hook, reg, actor } = await webhookOf(id);
  const [row] = await registryWrite(actor, "api", (w) =>
    w.tx
      .insert(regWebhook)
      .values({ tableId: hook.tableId, name: `${hook.name} copy`, url: hook.url, events: hook.events, filter: hook.filter, options: hook.options, secret: randomBytes(24).toString("hex"), active: false })
      .returning(),
  );
  return webhookOut(reg, row!);
}
