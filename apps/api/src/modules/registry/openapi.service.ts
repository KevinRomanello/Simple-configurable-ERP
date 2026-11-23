import { AGGREGATE_FNS, canSeeTable, CONDITION_OPS, isComputed, openRegistry, tablePermission, type Field } from "@erp/registry";
import { db } from "../../db/client";
import { viewerOf, visibleFields } from "./registry.access";
import { loadRegistry } from "./registry.data";

// GET /registry/openapi.json: the API of the registry described for the person asking (docs/anagrafiche.md,
// §10.5), made from the tables they can see, like the Swagger NocoDB makes for every base. n8n, Postman and the
// scripts read the fields and their types from here instead of guessing.

type Schema = Record<string, unknown>;

/** What a value of a field looks like in an answer. */
function valueSchema(field: Field): Schema {
  const o = field.options;
  switch (field.type) {
    case "number": return { type: "number", ...(o.min !== undefined ? { minimum: o.min } : {}), ...(o.max !== undefined ? { maximum: o.max } : {}) };
    case "rating": return { type: "integer", minimum: 0, maximum: o.max ?? 5 };
    case "autonumber": return { type: "integer" };
    case "rollup": return { type: "number" };
    case "duration": return { type: "number", description: "seconds" };
    case "time": return { type: "string", pattern: "^\\d{2}:\\d{2}:\\d{2}$" };
    case "geodata": return { type: "string", description: "latitude;longitude" };
    case "color": return { type: "string", pattern: "^#[0-9A-F]{6}$" };
    case "uuid": return { type: "string", format: "uuid" };
    case "qrcode": case "barcode": return { type: "string", nullable: true, description: `the text the ${field.type === "qrcode" ? "QR code" : "barcode"} shows` };
    case "user": return { type: "array", items: { $ref: "#/components/schemas/LinkedRecord" } };
    case "checkbox": return { type: "boolean" };
    case "date": return { type: "string", format: "date" };
    case "datetime": case "created": case "modified": return { type: "string", format: "date-time" };
    case "email": return { type: "string", format: "email" };
    case "url": return { type: "string", format: "uri" };
    case "select": return { type: "string", enum: (o.choices ?? []).map((c) => c.name) };
    case "multiselect": return { type: "array", items: { type: "string", enum: (o.choices ?? []).map((c) => c.name) } };
    case "link": return { type: "array", items: { $ref: "#/components/schemas/LinkedRecord" } };
    case "attachment": return { type: "array", items: { $ref: "#/components/schemas/File" } };
    case "lookup": return { type: "array", items: {} };
    case "json": case "formula": return {};
    case "button": return { type: "string", nullable: true, description: "the address a button opens, if it opens one" };
    default: return { type: "string" };
  }
}

/** What a value looks like when it is written: links and files as ids. */
function inputSchema(field: Field): Schema {
  if (field.type === "link" || field.type === "attachment" || field.type === "user") {
    return { type: "array", items: { type: "integer" }, description: field.type === "link" ? "ids of the linked records" : field.type === "user" ? "ids of users of the ERP" : "ids of files already attached" };
  }
  return valueSchema(field);
}

const describe = (field: Field) => [field.description, isComputed(field.type) ? "Worked out: read only." : "", field.required ? "Required." : "", field.unique ? "Unique." : ""].filter(Boolean).join(" ");

export async function registryOpenApi() {
  const reg = openRegistry(await loadRegistry(db, []));
  const viewer = viewerOf(reg);
  const schemas: Record<string, Schema> = {
    LinkedRecord: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } },
    File: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, mime: { type: "string" }, size: { type: "integer" } } },
    Filter: {
      type: "object",
      description: "Conditions joined by and/or; a condition is {field, op, value}; groups go inside groups.",
      properties: { join: { type: "string", enum: ["and", "or"] }, not: { type: "boolean" }, items: { type: "array", items: { type: "object", properties: { field: { type: "string" }, op: { type: "string", enum: [...CONDITION_OPS] }, value: {} } } } },
    },
  };
  const paths: Record<string, Schema> = {};
  const listParams = [
    { name: "view", in: "query", schema: { type: "string" }, description: "A view (id or name): its filter, sorts and fields" },
    { name: "where", in: "query", schema: { type: "string" }, description: "NocoDB syntax: (State,anyof,In trial,Active Member)~and(Area,eq,SW)" },
    { name: "filter", in: "query", schema: { type: "string" }, description: "A Filter as JSON" },
    { name: "sort", in: "query", schema: { type: "string" }, description: "Fields separated by commas, a minus for descending: -Date,Name" },
    { name: "fields", in: "query", schema: { type: "string" }, description: "Only these fields, separated by commas" },
    { name: "q", in: "query", schema: { type: "string" }, description: "Words looked for in every field" },
    { name: "groupBy", in: "query", schema: { type: "string" }, description: "Up to five fields, separated by commas: the answer has the groups and their counts" },
    { name: "aggregate", in: "query", schema: { type: "string" }, description: `Summaries over every record that matches: ${AGGREGATE_FNS.join("|")}:Field, separated by commas` },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000, default: 100 } },
    { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
    { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "NocoDB's paging, with pageSize (they win over offset and limit)" },
    { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000 } },
    { name: "fieldKey", in: "query", schema: { type: "string", enum: ["name", "id"], default: "name" }, description: "The fields of each record by name or by id" },
  ];
  const bulkBody = { type: "object", properties: { view: { type: "string" }, where: { type: "string" }, filter: { $ref: "#/components/schemas/Filter" }, q: { type: "string" }, ids: { type: "array", items: { type: "integer" } } } };
  const idParam = { name: "id", in: "path", required: true, schema: { type: "integer" } };

  for (const table of reg.snapshot.tables.filter((t) => canSeeTable(reg, t, viewer))) {
    const fields = visibleFields(reg, table, viewer);
    const writable = new Set(tablePermission(reg, table, viewer).writable);
    const key = table.name.replace(/[^A-Za-z0-9]+/g, "_");
    schemas[key] = {
      type: "object",
      properties: { id: { type: "integer" }, version: { type: "integer" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, fields: { type: "object", properties: Object.fromEntries(fields.map((f) => [f.name, { ...valueSchema(f), ...(describe(f) ? { description: describe(f) } : {}) }])) } },
    };
    const input = { type: "object", properties: Object.fromEntries(fields.filter((f) => writable.has(f.id)).map((f) => [f.name, inputSchema(f)])) };
    schemas[`${key}_input`] = { type: "object", required: ["fields"], properties: { fields: input, version: { type: "integer", description: "the version read before: a newer one answers 409" } } };
    const ref = { $ref: `#/components/schemas/${key}` };
    const base = `/registry/tables/${encodeURIComponent(table.name)}/records`;
    paths[base] = {
      get: { tags: [table.name], summary: `List ${table.name}`, parameters: listParams, responses: { 200: { description: "The records", content: { "application/json": { schema: { type: "object", properties: { records: { type: "array", items: ref }, total: { type: "integer" }, groups: { type: "array" }, aggregates: { type: "array" } } } } } } } },
      post: { tags: [table.name], summary: `Add to ${table.name} (one, or an array: all or none)`, requestBody: { content: { "application/json": { schema: { oneOf: [{ $ref: `#/components/schemas/${key}_input` }, { type: "array", items: { $ref: `#/components/schemas/${key}_input` } }] } } } }, responses: { 201: { description: "Added" } } },
      patch: { tags: [table.name], summary: `Change many records of ${table.name}`, requestBody: { content: { "application/json": { schema: { type: "array", items: { allOf: [{ type: "object", properties: { id: { type: "integer" } } }, { $ref: `#/components/schemas/${key}_input` }] } } } } }, responses: { 200: { description: "Changed" } } },
      delete: { tags: [table.name], summary: `Delete records of ${table.name}`, parameters: [{ name: "ids", in: "query", required: true, schema: { type: "string" }, description: "ids separated by commas" }], responses: { 204: { description: "Deleted" } } },
    };
    paths[`${base}/{id}`] = {
      get: { tags: [table.name], summary: "One record", parameters: [idParam], responses: { 200: { description: "The record", content: { "application/json": { schema: ref } } } } },
      patch: { tags: [table.name], summary: "Change a record", parameters: [idParam], requestBody: { content: { "application/json": { schema: { $ref: `#/components/schemas/${key}_input` } } } }, responses: { 200: { description: "Changed" }, 409: { description: "Changed by someone else, or a unique value already used" } } },
      delete: { tags: [table.name], summary: "Delete a record", parameters: [idParam], responses: { 204: { description: "Deleted" } } },
    };
    const tableBase = `/registry/tables/${encodeURIComponent(table.name)}`;
    paths[`${tableBase}/count`] = { get: { tags: [table.name], summary: "How many records match", parameters: listParams.slice(0, 6), responses: { 200: { description: "{ count }" } } } };
    paths[`${base}/upsert`] = {
      post: { tags: [table.name], summary: "Change the records with the same values of the match fields, add the others", requestBody: { content: { "application/json": { schema: { type: "object", properties: { match: { type: "array", items: { type: "string" } }, records: { type: "array", items: { $ref: `#/components/schemas/${key}_input` } } } } } } }, responses: { 200: { description: "{ records, created, updated }" } } },
    };
    paths[`${base}/bulk-update`] = { post: { tags: [table.name], summary: "The same values in every record found", requestBody: { content: { "application/json": { schema: { allOf: [bulkBody, { type: "object", properties: { fields: input } }] } } } }, responses: { 200: { description: "{ updated }" } } } };
    paths[`${base}/bulk-delete`] = { post: { tags: [table.name], summary: "Delete every record found", requestBody: { content: { "application/json": { schema: bulkBody } } }, responses: { 200: { description: "{ deleted }" } } } };
    paths[`${base}/{id}/duplicate`] = { post: { tags: [table.name], summary: "A copy of the record (values and links, not files)", parameters: [idParam], responses: { 201: { description: "The copy", content: { "application/json": { schema: ref } } } } } };
    for (const link of fields.filter((f) => f.type === "link")) {
      paths[`${base}/{id}/links/${encodeURIComponent(link.name)}`] = {
        get: { tags: [table.name], summary: `The records linked in ${link.name}, a page at a time`, parameters: [idParam, { name: "q", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer" } }, { name: "offset", in: "query", schema: { type: "integer" } }], responses: { 200: { description: "{ records, total }" } } },
        post: { tags: [table.name], summary: `Link records in ${link.name}`, parameters: [idParam], requestBody: { content: { "application/json": { schema: { type: "object", properties: { ids: { type: "array", items: { type: "integer" } } } } } } }, responses: { 200: { description: "The record" } } },
        delete: { tags: [table.name], summary: `Unlink records in ${link.name}`, parameters: [idParam, { name: "ids", in: "query", required: true, schema: { type: "string" } }], responses: { 200: { description: "The record" } } },
      };
    }
    for (const kind of ["csv", "json", "ics"]) paths[`${tableBase}/export.${kind}`] = { get: { tags: [table.name], summary: `The records as ${kind.toUpperCase()}${kind === "ics" ? " (a calendar or timeline view)" : ""}`, parameters: listParams.slice(0, 6), responses: { 200: { description: "A file" } } } };
    paths[`${base}/{id}/history`] = { get: { tags: [table.name], summary: "What changed, who and when", parameters: [idParam], responses: { 200: { description: "The changes" } } } };
    paths[`${base}/{id}/comments`] = {
      get: { tags: [table.name], summary: "The comments", parameters: [idParam], responses: { 200: { description: "The comments" } } },
      post: { tags: [table.name], summary: "Add a comment", parameters: [idParam], requestBody: { content: { "application/json": { schema: { type: "object", properties: { text: { type: "string" } } } } } }, responses: { 201: { description: "Added" } } },
    };
  }

  return {
    openapi: "3.0.3",
    info: { title: "Registry of the ERP", version: "1", description: "The tables of the registry this person can see, with their fields. docs/anagrafiche.md, §10." },
    servers: [{ url: "/api" }],
    security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "A token of Settings › Registry › API tokens" } }, schemas },
    paths,
  };
}
