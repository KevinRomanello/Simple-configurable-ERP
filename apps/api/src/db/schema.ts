import { FUND_TYPES, MOVEMENT_KINDS, PHASES, SPONSOR_TYPES } from "@erp/calc";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
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

// Money columns are `numeric` (exact). Drizzle returns them as strings; core/money.ts is the
// only place that converts them to the integer units the calculation engine works with.
// Dates are plain `date` columns, returned as ISO strings (YYYY-MM-DD).

export const phaseEnum = pgEnum("phase", PHASES);
export const sponsorTypeEnum = pgEnum("sponsor_type", SPONSOR_TYPES);
export const fundKindEnum = pgEnum("fund_kind", ["team", "external"]);
export const fundTypeEnum = pgEnum("fund_type", FUND_TYPES);
export const userRoleEnum = pgEnum("user_role", ["admin", "pm", "viewer"]);
export const movementKindEnum = pgEnum("movement_kind", MOVEMENT_KINDS);
export const itemOriginEnum = pgEnum("item_origin", ["bought", "made"]);

/** Binary data (the pictures of the inventory). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();

/** The budget is rebuilt every season; inventory (later) lives outside it. */
export const season = pgTable("season", {
  id: id(),
  name: text().notNull().unique(),
  startsOn: date().notNull(),
  endsOn: date().notNull(),
});

/** The six areas of the old sheet. `code` is a URL-safe slug, `name` is what the sheet showed. */
export const area = pgTable("area", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  position: integer().notNull(),
});

export const project = pgTable("project", {
  id: id(),
  seasonId: integer()
    .notNull()
    .references(() => season.id),
  areaId: integer()
    .notNull()
    .references(() => area.id),
  name: text().notNull(),
  /** The person written in the yellow subtotal row of the old sheet. */
  ownerName: text(),
  position: integer().notNull(),
});

export const budgetLine = pgTable("budget_line", {
  id: id(),
  projectId: integer()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  item: text().notNull(),
  // Validated by the service against listCategories()/PRIORITIES; plain text on purpose, because
  // categories are hardcoded for now and will become a table (see docs/hardcoded-registry.md).
  category: text(),
  priority: text(),
  note: text(),
  /** Bumped on every change; a write carrying an older version is rejected (optimistic lock). */
  version: integer().notNull().default(1),
});

/** One row per line and phase. A missing phase means "all zeros". */
export const lineFigures = pgTable(
  "line_figures",
  {
    id: id(),
    lineId: integer()
      .notNull()
      .references(() => budgetLine.id, { onDelete: "cascade" }),
    phase: phaseEnum().notNull(),
    quantity: numeric({ precision: 14, scale: 3 }).notNull().default("0"),
    unitNetCost: numeric({ precision: 14, scale: 4 }).notNull().default("0"),
    // Null sponsor type or VAT rate = the line is incomplete (VAT is not computed yet).
    sponsorType: sponsorTypeEnum(),
    sponsorValue: numeric({ precision: 14, scale: 2 }),
    vatRate: numeric({ precision: 5, scale: 2 }),
    supplierId: integer().references(() => supplier.id),
    purchaseDate: date(),
    arrivalDate: date(),
  },
  (t) => [
    unique("line_figures_line_phase_uq").on(t.lineId, t.phase),
    check("line_figures_non_negative", sql`${t.quantity} >= 0 and ${t.unitNetCost} >= 0`),
  ],
);

export const fund = pgTable(
  "fund",
  {
    id: id(),
    seasonId: integer()
      .notNull()
      .references(() => season.id),
    name: text().notNull(),
    kind: fundKindEnum().notNull(),
    // The sponsor's definition: the funds are black boxes that work out VAT and coverage from it
    // (docs/sponsor-e-fondi.md). A sponsor's fund covers the VAT of its purchases at its own rate
    // (0% = no VAT). The team fund is plain: its VAT rate is chosen on each line.
    type: fundTypeEnum().notNull().default("fund"),
    vatRate: numeric({ precision: 5, scale: 2 }),
    /** Funds with the same group (any spelling) can pay one line together. */
    groupName: text(),
  },
  (t) => [
    uniqueIndex("fund_season_name_uq").on(t.seasonId, sql`lower(${t.name})`),
    uniqueIndex("fund_one_team_per_season")
      .on(t.seasonId)
      .where(sql`${t.kind} = 'team'`),
    check(
      "fund_team_is_plain",
      sql`${t.kind} <> 'team' or (${t.type} = 'fund' and ${t.vatRate} is null and ${t.groupName} is null)`,
    ),
    check("fund_sponsor_has_rate", sql`${t.kind} = 'team' or ${t.vatRate} is not null`),
  ],
);

/** The funds that pay a line in a phase, in the order they are drawn down. */
export const lineFund = pgTable(
  "line_fund",
  {
    id: id(),
    figuresId: integer()
      .notNull()
      .references(() => lineFigures.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    fundId: integer()
      .notNull()
      .references(() => fund.id),
  },
  (t) => [
    unique("line_fund_position_uq").on(t.figuresId, t.position),
    unique("line_fund_fund_uq").on(t.figuresId, t.fundId),
  ],
);

/** The CASH FROM tables: what each fund is contractually worth and when it is paid in. */
export const fundContract = pgTable(
  "fund_contract",
  {
    id: id(),
    fundId: integer()
      .notNull()
      .references(() => fund.id),
    phase: phaseEnum().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    /** Real sheets contain contracts without a date. */
    inflowDate: date(),
  },
  (t) => [
    check("fund_contract_non_negative", sql`${t.amount} >= 0`),
    // The money of a sponsor in a phase is one value and one date, kept on the sponsor itself.
    unique("fund_contract_fund_phase_uq").on(t.fundId, t.phase),
  ],
);

/** The CASH FLOW tables: money that reaches the team, independent from the funds. */
export const teamInflow = pgTable(
  "team_inflow",
  {
    id: id(),
    seasonId: integer()
      .notNull()
      .references(() => season.id),
    phase: phaseEnum().notNull(),
    sourceName: text().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    inflowDate: date(),
  },
  (t) => [check("team_inflow_non_negative", sql`${t.amount} >= 0`)],
);

/** The BANK box of the CASH FLOW sheet: one balance at one date, valid for both phases. */
export const bankSnapshot = pgTable("bank_snapshot", {
  id: id(),
  seasonId: integer()
    .notNull()
    .unique()
    .references(() => season.id),
  amount: numeric({ precision: 14, scale: 2 }).notNull(),
  asOfDate: date(),
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

/** Which optional fields an item of a category shows; `category_id` null: the items without a category. */
export const categoryField = pgTable(
  "category_field",
  {
    id: id(),
    categoryId: integer().references(() => category.id, { onDelete: "cascade" }),
    field: text().notNull(),
  },
  (t) => [
    unique("category_field_uq").on(t.categoryId, t.field).nullsNotDistinct(),
    check("category_field_known", sql`${t.field} in ('purpose', 'safetyCodes', 'disposal', 'storageNotes', 'maintenanceNotes')`),
  ],
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

/** How an item is counted (pcs, m, kg…). */
export const unit = pgTable(
  "unit",
  {
    id: id(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("unit_name_uq").on(sql`lower(${t.name})`)],
);

/** Where things are kept: a site and a room. The code is what movements store, and never changes. */
export const location = pgTable(
  "location",
  {
    id: id(),
    code: text().notNull().unique(),
    site: text().notNull(),
    room: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [uniqueIndex("location_site_room_uq").on(sql`lower(${t.site})`, sql`lower(${t.room})`)],
);

/** The switches of the calculation: one row. */
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
  },
  (t) => [
    check("setting_one_row", sql`${t.id} = 1`),
    check("setting_threshold", sql`${t.varianceThreshold} >= 0 and ${t.varianceThreshold} <= 1`),
    check("setting_vat_base", sql`${t.vatBaseWhenTotalSponsor} in ('net', 'net-minus-sponsor')`),
    check("setting_inflow_vat", sql`${t.inflowVatRate} >= 0 and ${t.inflowVatRate} <= 100`),
    check("setting_bank_compare", sql`${t.bankCompareSummary} in ('day', 'month') and ${t.bankCompareTimeline} in ('day', 'month')`),
  ],
);

/** A single supplier list (the old sheet had one per phase). Not tied to a season. */
export const supplier = pgTable(
  "supplier",
  {
    id: id(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("supplier_name_uq").on(sql`lower(${t.name})`)],
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
  (t) => [unique("user_area_user_area_uq").on(t.userId, t.areaId)],
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

// --- inventory -----------------------------------------------------------------------------------
// What is on the shelf is never stored as a number: it is the sum of `stock_movement`. Rules and
// the reasons behind this shape: docs/inventario.md.

/**
 * A thing the team keeps: bought (a screw, a battery) or made by the team (a bracket) from other
 * items, listed in `component_part`. The optional texts (hazard codes, disposal, storage,
 * maintenance) are shown or hidden by category in the interface; none is required.
 */
export const inventoryItem = pgTable(
  "inventory_item",
  {
    id: id(),
    /** The team's own code or label, if it has one. */
    code: text(),
    name: text().notNull(),
    /** What it is for. */
    purpose: text(),
    // Validated by the service against listCategories(); plain text for the same reason as budget_line.
    category: text(),
    unit: text().notNull().default("pcs"),
    origin: itemOriginEnum().notNull().default("bought"),
    /** Hazard and precaution codes (H/P statements, UN number) of a dangerous material. */
    safetyCodes: text(),
    disposal: text(),
    storageNotes: text(),
    maintenanceNotes: text(),
    /** Changes whenever the picture does: it is what the history shows and what the browser cache keys on. */
    imageUpdatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_item_name_uq").on(sql`lower(${t.name})`),
    uniqueIndex("inventory_item_code_uq")
      .on(sql`lower(${t.code})`)
      .where(sql`${t.code} is not null`),
  ],
);

/** The picture of an item: a full size one and a small one for lists. Not in the history (it is binary). */
export const itemImage = pgTable("item_image", {
  itemId: integer()
    .primaryKey()
    .references(() => inventoryItem.id, { onDelete: "cascade" }),
  mime: text().notNull(),
  full: bytea().notNull(),
  thumb: bytea().notNull(),
});

/**
 * Everything that changes what is on the shelf. A receipt brings goods in (from a budget line, or
 * with no budget at all) and freezes their price; the other kinds take them out, move them or
 * correct the count.
 */
export const stockMovement = pgTable(
  "stock_movement",
  {
    id: id(),
    itemId: integer()
      .notNull()
      .references(() => inventoryItem.id),
    kind: movementKindEnum().notNull(),
    occurredOn: date().notNull(),
    /** Always above zero, except for a count (`adjustment`), which can be negative. */
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    /** Where: a code from listLocations() and a free note ("shelf 2, red box"). */
    location: text().notNull(),
    spot: text().notNull().default(""),
    /** Transfers only. */
    toLocation: text(),
    toSpot: text(),
    /** Receipts only, per unit: before VAT, with VAT, and what the team pays. */
    unitNet: numeric({ precision: 14, scale: 4 }),
    unitGross: numeric({ precision: 14, scale: 4 }),
    unitTeam: numeric({ precision: 14, scale: 4 }),
    projectId: integer().references(() => project.id, { onDelete: "set null" }),
    /** The purchase this receipt completes. */
    budgetLineId: integer().references(() => budgetLine.id, { onDelete: "set null" }),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "stock_movement_quantity",
      sql`(${t.kind} = 'adjustment' and ${t.quantity} <> 0) or (${t.kind} <> 'adjustment' and ${t.quantity} > 0)`,
    ),
    check(
      "stock_movement_prices",
      sql`(${t.kind} = 'receipt' and ${t.unitNet} is not null and ${t.unitGross} is not null and ${t.unitTeam} is not null)
        or (${t.kind} <> 'receipt' and ${t.unitNet} is null and ${t.unitGross} is null and ${t.unitTeam} is null)`,
    ),
    check("stock_movement_transfer", sql`(${t.kind} = 'transfer') = (${t.toLocation} is not null)`),
    index("stock_movement_item").on(t.itemId),
    index("stock_movement_line").on(t.budgetLineId),
  ],
);

/** The bill of materials: `quantity` of `partId` goes into one unit of the item `componentId`. */
export const componentPart = pgTable(
  "component_part",
  {
    id: id(),
    componentId: integer()
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "cascade" }),
    partId: integer()
      .notNull()
      .references(() => inventoryItem.id),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    note: text(),
  },
  (t) => [
    unique("component_part_uq").on(t.componentId, t.partId),
    check("component_part_quantity", sql`${t.quantity} > 0`),
    check("component_part_not_itself", sql`${t.componentId} <> ${t.partId}`),
  ],
);
