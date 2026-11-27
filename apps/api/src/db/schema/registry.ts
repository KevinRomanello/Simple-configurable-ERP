// The registry's tables (docs/anagrafiche.md): tables people define, as rows of these fixed tables.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bytea, id } from "./columns";
import { appUser } from "./platform";

// --- registry (anagrafiche) ----------------------------------------------------------------------
// Tables people define, as rows of these fixed tables: the values of a record are JSONB by field id, so
// adding a field needs no migration and the API's database user keeps no rights on the structure.
// The rules and the reasons: docs/anagrafiche.md.

/** A table of the registry: People, Areas, Certificates… `access` holds its permission rules (§7). */
export const regTable = pgTable(
  "reg_table",
  {
    id: id(),
    name: text().notNull(),
    description: text().notNull().default(""),
    icon: text().notNull().default(""),
    /** Groups the tables in the menu, like the bases of NocoDB. */
    section: text().notNull().default(""),
    position: integer().notNull(),
    /** The field that names a record; checked by the service (a foreign key would make a cycle with reg_field). */
    primaryFieldId: integer(),
    access: jsonb().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reg_table_name_uq").on(sql`lower(${t.name})`)],
);

/** A field of a table; `options` depend on its type (docs/anagrafiche.md, §4). */
export const regField = pgTable(
  "reg_field",
  {
    id: id(),
    tableId: integer()
      .notNull()
      .references(() => regTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: text().notNull(),
    options: jsonb().notNull().default(sql`'{}'::jsonb`),
    required: boolean().notNull().default(false),
    uniqueValues: boolean().notNull().default(false),
    description: text().notNull().default(""),
    position: integer().notNull(),
  },
  (t) => [uniqueIndex("reg_field_name_uq").on(t.tableId, sql`lower(${t.name})`)],
);

/** A view of a table (filter, sorts, hidden fields…) or a form; `slug` is the address of a form or of a public view. */
export const regView = pgTable(
  "reg_view",
  {
    id: id(),
    tableId: integer()
      .notNull()
      .references(() => regTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: text().notNull(),
    position: integer().notNull(),
    slug: text(),
    config: jsonb().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    uniqueIndex("reg_view_name_uq").on(t.tableId, sql`lower(${t.name})`),
    uniqueIndex("reg_view_slug_uq").on(sql`lower(${t.slug})`),
    check("reg_view_type", sql`${t.type} in ('grid', 'form', 'gallery', 'kanban', 'calendar', 'timeline', 'map')`),
  ],
);

/** A record: its stored values by field id. `version` for the optimistic lock, like the budget lines. */
export const regRecord = pgTable(
  "reg_record",
  {
    id: id(),
    tableId: integer()
      .notNull()
      .references(() => regTable.id, { onDelete: "cascade" }),
    data: jsonb().notNull().default(sql`'{}'::jsonb`),
    version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: integer().references(() => appUser.id, { onDelete: "set null" }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer().references(() => appUser.id, { onDelete: "set null" }),
  },
  (t) => [index("reg_record_table").on(t.tableId)],
);

/** A link between two records, kept once, by the link field that owns the pair (the inverse reads it the other way). */
export const regLink = pgTable(
  "reg_link",
  {
    id: id(),
    fieldId: integer()
      .notNull()
      .references(() => regField.id, { onDelete: "cascade" }),
    recordId: integer()
      .notNull()
      .references(() => regRecord.id, { onDelete: "cascade" }),
    targetId: integer()
      .notNull()
      .references(() => regRecord.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
  },
  (t) => [unique("reg_link_uq").on(t.fieldId, t.recordId, t.targetId), index("reg_link_record").on(t.recordId), index("reg_link_target").on(t.targetId)],
);

/** An attached file. The record keeps the ids in its data (so they are in the history); the bytes are read only to open one. Not in the history. */
export const regFile = pgTable(
  "reg_file",
  {
    id: id(),
    recordId: integer()
      .notNull()
      .references(() => regRecord.id, { onDelete: "cascade" }),
    fieldId: integer()
      .notNull()
      .references(() => regField.id, { onDelete: "cascade" }),
    name: text().notNull(),
    mime: text().notNull(),
    sizeBytes: integer().notNull(),
    data: bytea().notNull(),
    uploadedBy: integer().references(() => appUser.id, { onDelete: "set null" }),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reg_file_record").on(t.recordId)],
);

/** Who to tell when records of a table change (n8n): events, an optional filter, the secret that signs the call. */
export const regWebhook = pgTable(
  "reg_webhook",
  {
    id: id(),
    tableId: integer()
      .notNull()
      .references(() => regTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    url: text().notNull(),
    events: text().array().notNull(),
    filter: jsonb(),
    secret: text().notNull(),
    active: boolean().notNull().default(true),
    /** How it is called: method, extra headers, a template of the body, the fields whose change counts, when it fires. */
    options: jsonb().notNull().default({}),
  },
  (t) => [index("reg_webhook_table").on(t.tableId)],
);

/** The last calls of the webhooks and how they went. Not in the history (it is a log). */
export const regWebhookLog = pgTable(
  "reg_webhook_log",
  {
    id: id(),
    webhookId: integer()
      .notNull()
      .references(() => regWebhook.id, { onDelete: "cascade" }),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    event: text().notNull(),
    recordId: integer(),
    /** The HTTP status of the answer; null when there was none. */
    status: integer(),
    error: text(),
  },
  (t) => [index("reg_webhook_log_hook").on(t.webhookId, t.at)],
);

/** Which table holds the people and which of its fields the email they sign in with (§7.2). One row. */
export const regSettings = pgTable(
  "reg_settings",
  {
    id: integer().primaryKey().default(1),
    peopleTableId: integer().references(() => regTable.id, { onDelete: "set null" }),
    emailFieldId: integer().references(() => regField.id, { onDelete: "set null" }),
  },
  (t) => [check("reg_settings_one_row", sql`${t.id} = 1`)],
);

/** Secrets the server makes for itself (the key of the personal links of the forms). Not in the history. */
export const appSecret = pgTable("app_secret", {
  name: text().primaryKey(),
  value: text().notNull(),
});

/** A comment on a record of the registry (like the comments of NocoDB): who, when, what. */
export const regComment = pgTable(
  "reg_comment",
  {
    id: id(),
    recordId: integer()
      .notNull()
      .references(() => regRecord.id, { onDelete: "cascade" }),
    authorId: integer().references(() => appUser.id, { onDelete: "set null" }),
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** When its author last changed it, and when somebody marked it resolved (empty: still open). */
    editedAt: timestamp({ withTimezone: true }),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedBy: integer().references(() => appUser.id, { onDelete: "set null" }),
  },
  (t) => [index("reg_comment_record").on(t.recordId)],
);
