// The core's tables: the seasons and the areas, the lists everybody writes by name (categories, VAT rates), the settings, the people who sign in and what they may do,
// the keys of the services, the History and the switches of the modules. Always on: no module's table is here (docs/moduli-architettura.md, §6).

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id } from "./columns";

export const userRoleEnum = pgEnum("user_role", ["admin", "pm", "viewer"]);

/**
 * One budget per season (1 September - 31 August), and the car the team builds in it. Inventory lives
 * outside it. A read-only season refuses every change to its budget. docs/stagioni-anni-fiscali-e-macchine.md
 */
export const season = pgTable("season", {
  id: id(),
  name: text().notNull().unique(),
  startsOn: date().notNull(),
  endsOn: date().notNull(),
  car: text().notNull(),
  readOnly: boolean().notNull().default(false),
});

/** The six areas of the old sheet. `code` is a URL-safe slug, `name` is what the sheet showed. */
export const area = pgTable("area", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  position: integer().notNull(),
  /** Calculated from the register of the team's money (what is outside the budget), not typed: read-only, no rows of its own. */
  derived: boolean().notNull().default(false),
});

// --- what an admin sets on the Settings page (the lists and the switches of the calculation) ------
// They started as values in the code ("hardcoded", project rule 4); migration 0010 wrote those
// values here. docs/impostazioni.md.

/** The categories of the budget and of the inventory, in their order (the blocks of TOTAL and the Gantt). */
export const category = pgTable(
  "category",
  {
    id: id(),
    name: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [uniqueIndex("category_name_uq").on(sql`lower(${t.name})`)],
);

/** The VAT rates a line, a sponsor or an arrival can use, in percent. */
export const vatRate = pgTable(
  "vat_rate",
  {
    id: id(),
    rate: numeric({ precision: 5, scale: 2 }).notNull().unique(),
  },
  (t) => [check("vat_rate_range", sql`${t.rate} >= 0 and ${t.rate} <= 100`)],
);

/** The switches of the calculation and of the site: one row. */
export const setting = pgTable(
  "setting",
  {
    id: integer().primaryKey().default(1),
    /** TOTAL: variances beyond +/- this ratio are flagged. */
    varianceThreshold: numeric({ precision: 5, scale: 4 }).notNull(),
    /** What the VAT is computed on when a sponsor covers the whole line (question Q1). */
    vatBaseWhenTotalSponsor: text().notNull(),
    /** VAT, in percent, that the team owes on every inflow. */
    inflowVatRate: numeric({ precision: 5, scale: 2 }).notNull(),
    /** How dates are compared with the BANK date: in the CASH FLOW summary and in the Gantt (question Q2). */
    bankCompareSummary: text().notNull(),
    bankCompareTimeline: text().notNull(),
    /** Whether the site can be changed from a phone. Off: on a phone everybody sees it read-only (a guard against stray taps, not a permission). */
    editOnPhone: boolean().notNull().default(true),
  },
  (t) => [
    check("setting_one_row", sql`${t.id} = 1`),
    check("setting_threshold", sql`${t.varianceThreshold} >= 0 and ${t.varianceThreshold} <= 1`),
    check("setting_vat_base", sql`${t.vatBaseWhenTotalSponsor} in ('net', 'net-minus-sponsor')`),
    check("setting_inflow_vat", sql`${t.inflowVatRate} >= 0 and ${t.inflowVatRate} <= 100`),
    check("setting_bank_compare", sql`${t.bankCompareSummary} in ('day', 'month') and ${t.bankCompareTimeline} in ('day', 'month')`),
  ],
);

/**
 * People who can sign in (always with a Google account of the team). A user is created at the
 * first login, as `viewer`; an admin promotes them. People who leave are deactivated, never
 * deleted, so the history keeps pointing at them.
 */
export const appUser = pgTable(
  "app_user",
  {
    id: id(),
    email: text().notNull(),
    name: text().notNull(),
    role: userRoleEnum().notNull().default("viewer"),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("app_user_email_uq").on(sql`lower(${t.email})`)],
);

/**
 * The boxes of a person (a project manager who also keeps the money of the team, or the sponsors): one row for each box that is ticked.
 * The modules say which boxes there are (`userFlags`, docs/moduli-architettura.md, §8): this table does not know them.
 */
export const userFlag = pgTable(
  "user_flag",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    flag: text().notNull(),
  },
  (t) => [unique("user_flag_user_flag_uq").on(t.userId, t.flag)],
);

/** The areas a `pm` may change. Other roles ignore it. */
export const userArea = pgTable(
  "user_area",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    areaId: integer()
      .notNull()
      .references(() => area.id),
  },
  (t) => [unique("user_area_user_area_uq").on(t.userId, t.areaId), index("user_area_area").on(t.areaId)],
);

/**
 * Who changed what. Rows are written by a trigger (see the "audit_triggers" migration) in the
 * same transaction as the change, so a change and its history can never disagree. `actor_id` has
 * no foreign key on purpose: the history must outlive anything. Null actor = not a signed-in
 * person (the seed, the importer).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorId: integer(),
    tableName: text().notNull(),
    rowId: integer().notNull(),
    action: text().notNull(),
    before: jsonb(),
    after: jsonb(),
  },
  (t) => [
    check("audit_log_action", sql`${t.action} in ('insert', 'update', 'delete')`),
    index("audit_log_table_row").on(t.tableName, t.rowId),
    index("audit_log_at").on(t.at),
  ],
);

/** Keys for services (n8n, the bot, the website): each acts as one user of the ERP. Only the SHA-256 of the key is kept. */
export const apiToken = pgTable(
  "api_token",
  {
    id: id(),
    name: text().notNull(),
    tokenHash: text().notNull(),
    userId: integer()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    createdBy: integer().references(() => appUser.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("api_token_hash_uq").on(t.tokenHash), index("api_token_user").on(t.userId)],
);

/**
 * A part of the ERP that an admin has turned off (Settings › App › Modules, docs/moduli.md). A module without a row is on:
 * which modules there are, and what each one covers, is written in `appmodules.service.ts`, so a new one needs no migration.
 */
export const appModule = pgTable("app_module", {
  id: id(),
  key: text().notNull().unique(),
  enabled: boolean().notNull().default(true),
});
