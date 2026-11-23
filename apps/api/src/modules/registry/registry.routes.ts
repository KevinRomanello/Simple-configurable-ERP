import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, shortText } from "../../core/validation";
import { registryOpenApi } from "./openapi.service";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { appUser } from "../../db/schema";
import { addComment, deleteComment, editComment, listComments, resolveComment } from "./comments.service";
import { duplicateField, duplicateTable, duplicateView, tableFromCsv } from "./copies.service";
import { exportCsv, exportIcs, exportJson } from "./exports.service";
import { getTile } from "./tiles.service";
import { createPersonalLink, getForm, getSharedCsv, getSharedFile, getSharedView, listMyForms, submitForm } from "./forms.service";
import {
  bulkDelete, bulkUpdate, changeLinks, countRecords, createRecords, disposition, duplicateRecord, getFile, getRecord, importCsv, listLinked, listNames, listRecords, pressButton, recordHistory, removeFile,
  removeRecords, updateRecords, uploadFile, upsertRecords,
} from "./records.service";
import {
  bulkInput, commentEditInput, commentInput, createFieldInput, createRecordsInput, createTableInput, createViewInput, duplicateInput, fileQuery, idsInput, idsQuery, importInput, linkInput, orderInput,
  recordsQuery, resolveInput, settingsInput, submitInput, tableImportInput, updateFieldInput, updateRecordInput, updateRecordsInput, updateTableInput, updateViewInput, updateWebhookInput, upsertInput,
  viewFiltersInput, viewSortsInput, webhookInput,
} from "./registry.schema";
import {
  createField, createTable, createView, deleteField, deleteTable, deleteView, getField, getRegistrySettings, getTable, getView, groupMembers, listTables, orderFields, registryMe,
  setRegistrySettings, setViewPart, updateField, updateTable, updateView, viewPart,
} from "./schema.service";
import { createWebhook, deleteWebhook, duplicateWebhook, getWebhook, listWebhooks, testWebhook, updateWebhook, webhookLog } from "./webhooks.service";

// The registry over HTTP (docs/anagrafiche.md, §10.2). No logic here: the services check and do.

/** A table by id or by name. */
const table = z.object({ t: shortText(200) });
const record = z.object({ t: shortText(200), id });
const recordField = z.object({ t: shortText(200), id, field: shortText(200) });
const byId = z.object({ id });
const bySlug = z.object({ slug: shortText(64) });
const linkedQuery = z.object({ q: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(1_000).default(25), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) });
/** The password of a shared view comes in a header, never in the address (addresses end up in logs). */
const viewPassword = (request: import("fastify").FastifyRequest) => {
  const value = request.headers["x-view-password"];
  return typeof value === "string" && value.length <= 200 ? value : undefined;
};
const attachment = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;

/** The files people attach: up to 50 MB, the largest a field may allow; a form carries them as base64. */
const FILE_BYTES = 50_000_000 + 4_096;
const FORM_BYTES = 70_000_000;

export async function registryRoutes(app: FastifyInstance) {
  // the body of an upload is the file itself, whatever its type (JSON stays JSON)
  app.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: FILE_BYTES }, (_request, body, done) => done(null, body));

  // tables, fields, views
  app.get("/registry/tables", () => listTables());
  app.post("/registry/tables", async (request, reply) => reply.code(201).send(await createTable(createTableInput.parse(request.body))));
  app.post("/registry/tables/import", { bodyLimit: 21_000_000 }, async (request, reply) => reply.code(201).send(await tableFromCsv(tableImportInput.parse(request.body))));
  app.post("/registry/tables/:t/duplicate", async (request, reply) => reply.code(201).send(await duplicateTable(table.parse(request.params).t, duplicateInput.parse(request.body ?? {}))));
  app.get("/registry/tables/:t", (request) => getTable(table.parse(request.params).t));
  app.patch("/registry/tables/:t", (request) => updateTable(table.parse(request.params).t, updateTableInput.parse(request.body)));
  app.delete("/registry/tables/:t", async (request, reply) => {
    await deleteTable(table.parse(request.params).t);
    return reply.code(204).send();
  });
  app.post("/registry/tables/:t/fields", async (request, reply) => reply.code(201).send(await createField(table.parse(request.params).t, createFieldInput.parse(request.body))));
  app.put("/registry/tables/:t/fields/order", (request) => orderFields(table.parse(request.params).t, orderInput.parse(request.body).ids));
  app.get("/registry/fields/:id", (request) => getField(byId.parse(request.params).id));
  app.patch("/registry/fields/:id", (request) => updateField(byId.parse(request.params).id, updateFieldInput.parse(request.body)));
  app.post("/registry/fields/:id/duplicate", async (request, reply) => reply.code(201).send(await duplicateField(byId.parse(request.params).id, duplicateInput.parse(request.body ?? {}).name)));
  app.delete("/registry/fields/:id", async (request, reply) => {
    await deleteField(byId.parse(request.params).id);
    return reply.code(204).send();
  });
  app.post("/registry/tables/:t/views", async (request, reply) => reply.code(201).send(await createView(table.parse(request.params).t, createViewInput.parse(request.body))));
  app.get("/registry/views/:id", (request) => getView(byId.parse(request.params).id));
  app.patch("/registry/views/:id", (request) => updateView(byId.parse(request.params).id, updateViewInput.parse(request.body)));
  app.post("/registry/views/:id/duplicate", async (request, reply) => reply.code(201).send(await duplicateView(byId.parse(request.params).id, duplicateInput.parse(request.body ?? {}).name)));
  app.get("/registry/views/:id/filters", (request) => viewPart(byId.parse(request.params).id, "filter"));
  app.put("/registry/views/:id/filters", (request) => setViewPart(byId.parse(request.params).id, "filter", viewFiltersInput.parse(request.body).filter));
  app.get("/registry/views/:id/sorts", (request) => viewPart(byId.parse(request.params).id, "sorts"));
  app.put("/registry/views/:id/sorts", (request) => setViewPart(byId.parse(request.params).id, "sorts", viewSortsInput.parse(request.body).sorts));
  app.delete("/registry/views/:id", async (request, reply) => {
    await deleteView(byId.parse(request.params).id);
    return reply.code(204).send();
  });

  // records
  app.get("/registry/tables/:t/names", (request) => listNames(table.parse(request.params).t, z.object({ view: shortText(200).optional() }).parse(request.query).view));
  app.get("/registry/tables/:t/records", (request) => listRecords(table.parse(request.params).t, recordsQuery.parse(request.query)));
  app.get("/registry/tables/:t/count", (request) => countRecords(table.parse(request.params).t, recordsQuery.parse(request.query)));
  app.post("/registry/tables/:t/records/upsert", (request) => upsertRecords(table.parse(request.params).t, upsertInput.parse(request.body)));
  app.post("/registry/tables/:t/records/bulk-update", (request) => bulkUpdate(table.parse(request.params).t, bulkInput.parse(request.body)));
  app.post("/registry/tables/:t/records/bulk-delete", (request) => bulkDelete(table.parse(request.params).t, bulkInput.parse(request.body)));
  app.post("/registry/tables/:t/records", async (request, reply) => {
    const body = createRecordsInput.parse(request.body);
    const created = await createRecords(table.parse(request.params).t, Array.isArray(body) ? body : [body]);
    return reply.code(201).send(Array.isArray(body) ? created : created[0]);
  });
  app.patch("/registry/tables/:t/records", (request) => updateRecords(table.parse(request.params).t, updateRecordsInput.parse(request.body)));
  app.delete("/registry/tables/:t/records", async (request, reply) => {
    await removeRecords(table.parse(request.params).t, idsQuery.parse(request.query).ids.split(",").map(Number));
    return reply.code(204).send();
  });
  app.get("/registry/tables/:t/records/:id", (request) => {
    const p = record.parse(request.params);
    return getRecord(p.t, p.id);
  });
  app.patch("/registry/tables/:t/records/:id", async (request) => {
    const p = record.parse(request.params);
    const body = updateRecordInput.parse(request.body);
    return (await updateRecords(p.t, [{ id: p.id, fields: body.fields, version: body.version }]))[0];
  });
  app.delete("/registry/tables/:t/records/:id", async (request, reply) => {
    const p = record.parse(request.params);
    await removeRecords(p.t, [p.id]);
    return reply.code(204).send();
  });
  app.get("/registry/tables/:t/records/:id/history", (request) => {
    const p = record.parse(request.params);
    return recordHistory(p.t, p.id);
  });
  app.post("/registry/tables/:t/records/:id/duplicate", async (request, reply) => {
    const p = record.parse(request.params);
    return reply.code(201).send(await duplicateRecord(p.t, p.id));
  });
  app.get("/registry/tables/:t/records/:id/links/:field", (request) => {
    const p = recordField.parse(request.params);
    return listLinked(p.t, p.id, p.field, linkedQuery.parse(request.query));
  });
  app.post("/registry/tables/:t/records/:id/links/:field", (request) => {
    const p = recordField.parse(request.params);
    return changeLinks(p.t, p.id, p.field, idsInput.parse(request.body).ids, true);
  });
  app.delete("/registry/tables/:t/records/:id/links/:field", (request) => {
    const p = recordField.parse(request.params);
    return changeLinks(p.t, p.id, p.field, idsQuery.parse(request.query).ids.split(",").map(Number), false);
  });
  app.post("/registry/tables/:t/records/:id/buttons/:field", async (request, reply) => {
    const p = recordField.parse(request.params);
    const { url } = await pressButton(p.t, p.id, p.field);
    return url ? { ok: true, url } : reply.code(202).send({ ok: true });
  });

  // comments
  app.get("/registry/tables/:t/records/:id/comments", (request) => {
    const p = record.parse(request.params);
    return listComments(p.t, p.id);
  });
  app.post("/registry/tables/:t/records/:id/comments", async (request, reply) => {
    const p = record.parse(request.params);
    return reply.code(201).send(await addComment(p.t, p.id, commentInput.parse(request.body).text));
  });
  app.patch("/registry/comments/:id", (request) => editComment(byId.parse(request.params).id, commentEditInput.parse(request.body).text));
  app.post("/registry/comments/:id/resolve", (request) => resolveComment(byId.parse(request.params).id, resolveInput.parse(request.body).resolved));
  app.delete("/registry/comments/:id", async (request, reply) => {
    await deleteComment(byId.parse(request.params).id);
    return reply.code(204).send();
  });

  // files
  app.post("/registry/tables/:t/records/:id/files/:field", { bodyLimit: FILE_BYTES }, async (request, reply) => {
    const p = recordField.parse(request.params);
    const mime = String(request.headers["content-type"] ?? "application/octet-stream").split(";")[0]!.trim();
    return reply.code(201).send(await uploadFile(p.t, p.id, p.field, fileQuery.parse(request.query).name, mime, request.body));
  });
  app.get("/registry/files/:id", async (request, reply) => {
    const file = await getFile(byId.parse(request.params).id);
    return sendFile(reply, file);
  });
  app.delete("/registry/files/:id", async (request, reply) => {
    await removeFile(byId.parse(request.params).id);
    return reply.code(204).send();
  });

  // files of records: CSV, JSON, iCalendar
  app.get("/registry/tables/:t/export.csv", async (request, reply) => {
    const { name, csv } = await exportCsv(table.parse(request.params).t, recordsQuery.parse(request.query));
    return reply.header("Content-Disposition", attachment(`${name}.csv`)).type("text/csv; charset=utf-8").send(csv);
  });
  app.get("/registry/tables/:t/export.json", async (request, reply) => {
    const { name, records } = await exportJson(table.parse(request.params).t, recordsQuery.parse(request.query));
    return reply.header("Content-Disposition", attachment(`${name}.json`)).send(records);
  });
  app.get("/registry/tables/:t/export.ics", async (request, reply) => {
    const base = (process.env.PUBLIC_URL ?? `${request.protocol}://${request.host}`).replace(/\/$/, "");
    const { name, ics } = await exportIcs(table.parse(request.params).t, recordsQuery.parse(request.query), base);
    return reply.header("Content-Disposition", attachment(`${name}.ics`)).type("text/calendar; charset=utf-8").send(ics);
  });
  app.post("/registry/tables/:t/import", { bodyLimit: 21_000_000 }, (request) => importCsv(table.parse(request.params).t, importInput.parse(request.body)));

  // webhooks
  app.get("/registry/tables/:t/webhooks", (request) => listWebhooks(table.parse(request.params).t));
  app.post("/registry/tables/:t/webhooks", async (request, reply) => reply.code(201).send(await createWebhook(table.parse(request.params).t, webhookInput.parse(request.body))));
  app.patch("/registry/webhooks/:id", (request) => updateWebhook(byId.parse(request.params).id, updateWebhookInput.parse(request.body)));
  app.delete("/registry/webhooks/:id", async (request, reply) => {
    await deleteWebhook(byId.parse(request.params).id);
    return reply.code(204).send();
  });
  app.get("/registry/webhooks/:id", (request) => getWebhook(byId.parse(request.params).id));
  app.post("/registry/webhooks/:id/duplicate", async (request, reply) => reply.code(201).send(await duplicateWebhook(byId.parse(request.params).id)));
  app.get("/registry/webhooks/:id/log", (request) => webhookLog(byId.parse(request.params).id));
  app.post("/registry/webhooks/:id/test", (request) => testWebhook(byId.parse(request.params).id));

  // the description of the API, made from the tables the person can see
  app.get("/registry/openapi.json", () => registryOpenApi());

  // settings, me, groups, forms
  app.get("/registry/settings", () => getRegistrySettings());
  app.put("/registry/settings", (request) => setRegistrySettings(settingsInput.parse(request.body)));
  app.get("/registry/me", () => registryMe());
  // the pictures of the map view, through the server
  app.get("/registry/tiles/:z/:x/:y.png", async (request, reply) => {
    const p = z.object({ z: z.coerce.number().int(), x: z.coerce.number().int(), y: z.coerce.number().int() }).parse(request.params);
    const tile = await getTile(p.z, p.x, p.y);
    return reply.header("Cache-Control", "private, max-age=86400").type(tile.type).send(tile.bytes);
  });
  // the people of the ERP, for the user fields: names only
  app.get("/registry/users", () => db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(and(eq(appUser.active, true))).orderBy(asc(appUser.name)));
  app.get("/registry/groups/:id/members", (request) => groupMembers(byId.parse(request.params).id));
  app.get("/registry/forms", () => listMyForms());
  app.post("/registry/forms/:id/links", (request) => {
    const body = linkInput.parse(request.body);
    return createPersonalLink(byId.parse(request.params).id, body.recordId, body.days);
  });

  // forms: at /public for anybody, never knowing who is there (addAuthHook), and here for who is signed in
  const formQuery = z.object({ t: z.string().max(200).optional() }).transform((q) => ({ token: q.t }));
  for (const prefix of ["/registry/public/forms", "/registry/forms/by-slug"]) {
    app.get(`${prefix}/:slug`, (request) => getForm(bySlug.parse(request.params).slug, formQuery.parse(request.query)));
    app.post(`${prefix}/:slug`, { bodyLimit: FORM_BYTES }, (request) => submitForm(bySlug.parse(request.params).slug, submitInput.parse(request.body)));
  }
  app.get("/registry/public/views/:slug", (request) => getSharedView(bySlug.parse(request.params).slug, viewPassword(request)));
  app.get("/registry/public/views/:slug/export.csv", async (request, reply) => {
    const { name, csv } = await getSharedCsv(bySlug.parse(request.params).slug, viewPassword(request));
    return reply.header("Content-Disposition", attachment(`${name}.csv`)).type("text/csv; charset=utf-8").send(csv);
  });
  app.get("/registry/public/views/:slug/files/:id", async (request, reply) => {
    const p = z.object({ slug: shortText(64), id }).parse(request.params);
    const file = await getSharedFile(p.slug, p.id, viewPassword(request));
    return reply.header("Content-Disposition", file.header).header("Content-Security-Policy", policyFor(file.type)).type(file.type).send(file.data);
  });
}

/** Sends a file: shown in the page only if it is really an image or a PDF, downloaded otherwise. */
function sendFile(reply: import("fastify").FastifyReply, file: { name: string; mime: string; data: Buffer }) {
  const how = disposition(file.name, file.mime, file.data);
  return reply
    .header("Content-Disposition", how.header)
    .header("Content-Security-Policy", policyFor(how.type))
    .header("Cache-Control", "private, max-age=600")
    .type(how.type)
    .send(file.data);
}

/** A PDF viewer refuses "nothing may be loaded from here" (like the data sheets of the inventory); everything else gets it. */
const policyFor = (type: string) => (type === "application/pdf" ? "frame-ancestors 'none'" : "default-src 'none'; frame-ancestors 'none'");
