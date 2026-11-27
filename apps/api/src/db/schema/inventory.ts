// The inventory's tables (docs/inventario.md): what is on the shelf is never stored as a number, it is the sum of `stock_movement`. Also the lists the inventory is written with (units, places, the fields of a category).

import { MOVEMENT_KINDS } from "@erp/calc";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bytea, id } from "./columns";
import { budgetLine, project } from "./budget";
import { appUser, area, category, season } from "./platform";

export const movementKindEnum = pgEnum("movement_kind", MOVEMENT_KINDS);

export const itemOriginEnum = pgEnum("item_origin", ["bought", "made"]);

/** What is written in a parameter of an item type: a number (with its unit), one of a list, a text, a yes or no. */
export const PARAM_KINDS = ["number", "list", "text", "yesno"] as const;

export const paramKindEnum = pgEnum("param_kind", PARAM_KINDS);

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

/** How an item is counted (pcs, m, kg…). */
export const unit = pgTable(
  "unit",
  {
    id: id(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("unit_name_uq").on(sql`lower(${t.name})`)],
);

/**
 * Where things are kept: a room, and on it a shelf and a level of the shelf (both optional, plain text). The code is what
 * movements store, and never changes.
 */
export const location = pgTable(
  "location",
  {
    id: id(),
    code: text().notNull().unique(),
    room: text().notNull(),
    shelf: text().notNull().default(""),
    level: text().notNull().default(""),
    position: integer().notNull(),
  },
  (t) => [uniqueIndex("location_room_shelf_level_uq").on(sql`lower(${t.room})`, sql`lower(${t.shelf})`, sql`lower(${t.level})`)],
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
    /** The make and the model, free text like on a line of the budget: with the name they say which item it is (docs/inventario.md, §4). */
    brand: text(),
    model: text(),
    /** What it is for. */
    purpose: text(),
    // Validated by the service against listCategories(); plain text for the same reason as budget_line.
    category: text(),
    /** The area the item belongs to; null: every area. */
    areaId: integer().references(() => area.id),
    /** What kind of thing it is (Resistor, Screw…): what is written about it is in `item_param_value`. */
    typeId: integer().references((): AnyPgColumn => itemType.id),
    unit: text().notNull().default("pcs"),
    origin: itemOriginEnum().notNull().default("bought"),
    /** Hazard and precaution codes (H/P statements, UN number) of a dangerous material. */
    safetyCodes: text(),
    disposal: text(),
    storageNotes: text(),
    maintenanceNotes: text(),
    /**
     * Only a made item: what «Make new» starts from, set when the item is made or later, so that making some asks for the
     * quantity and little else. The project is one of a season (it is not offered when it is of another).
     */
    makeProjectId: integer().references(() => project.id, { onDelete: "set null" }),
    /** The place (and exact spot) the pieces made are put in: a code of the places. The parts come from wherever they are. */
    makeTo: text(),
    makeToSpot: text().notNull().default(""),
    /** What the item is: always asked (unlike the optional texts above), because the team filters on it. */
    flammable: boolean().notNull().default(false),
    toxic: boolean().notNull().default(false),
    carcinogenic: boolean().notNull().default(false),
    /** Changes whenever the picture does: it is what the history shows and what the browser cache keys on. */
    imageUpdatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // an item is its name, brand and model together (a missing brand or model counts as empty), in any case
    uniqueIndex("inventory_item_identity_uq").on(sql`lower(${t.name})`, sql`lower(coalesce(${t.brand}, ''))`, sql`lower(coalesce(${t.model}, ''))`),
    uniqueIndex("inventory_item_code_uq")
      .on(sql`lower(${t.code})`)
      .where(sql`${t.code} is not null`),
    index("inventory_item_area").on(t.areaId),
    index("inventory_item_type").on(t.typeId),
  ],
);

/**
 * A kind of thing the team keeps (Resistor, Capacitor, Screw), made on the Settings page, with the
 * parameters written about each item of it (`item_type_param`). docs/inventario.md, §19.
 */
export const itemType = pgTable(
  "item_type",
  {
    id: id(),
    name: text().notNull(),
    /**
     * The type this one is a kind of (IC > Op-amp); null: a type of its own. A type has the parameters of all its parents and
     * adds its own. The names are unique among the types under the same parent.
     */
    parentId: integer().references((): AnyPgColumn => itemType.id),
    /** The area it belongs to; null: every area. */
    areaId: integer().references(() => area.id),
    /** Whether the form of its items asks flammable, toxic and carcinogenic. */
    hazards: boolean().notNull().default(true),
    /**
     * The category of the budget its items belong to: the items take it from here (their own `category` follows it), so
     * the statistics and the optional fields of the form follow it. Asked when a type is made; the types made before
     * have none until somebody chooses (their items keep the category they have).
     */
    categoryId: integer().references(() => category.id),
  },
  (t) => [
    uniqueIndex("item_type_name_uq").on(sql`coalesce(${t.parentId}, 0)`, sql`lower(${t.name})`),
    index("item_type_area").on(t.areaId),
    index("item_type_parent").on(t.parentId),
  ],
);

/** What is written about each item of a type: "Resistance" in Ω, "Package" from a list… */
export const itemTypeParam = pgTable(
  "item_type_param",
  {
    id: id(),
    typeId: integer()
      .notNull()
      .references(() => itemType.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: paramKindEnum().notNull(),
    /** A number: the unit it is written in (Ω, V, mm²); null: none. */
    unit: text(),
    /** A number: whether it is written with k, M, m, µ… (10k is 10000). */
    prefixes: boolean().notNull().default(false),
    /** A list: what can be chosen, in order. */
    choices: text().array().notNull().default(sql`'{}'::text[]`),
    position: integer().notNull(),
  },
  (t) => [
    uniqueIndex("item_type_param_name_uq").on(t.typeId, sql`lower(${t.name})`),
    check("item_type_param_number", sql`${t.kind} = 'number' or (${t.unit} is null and not ${t.prefixes})`),
    check("item_type_param_list", sql`${t.kind} = 'list' or cardinality(${t.choices}) = 0`),
  ],
);

/**
 * The value of a parameter for an item: exactly one of the three columns, by the kind of the
 * parameter. A number is in the unit of the parameter (10 kΩ is stored as 10000), exact.
 */
export const itemParamValue = pgTable(
  "item_param_value",
  {
    id: id(),
    itemId: integer()
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "cascade" }),
    paramId: integer()
      .notNull()
      .references(() => itemTypeParam.id, { onDelete: "cascade" }),
    number: numeric(),
    /** A list (one of its choices) or a text. */
    text: text(),
    flag: boolean(),
  },
  (t) => [
    unique("item_param_value_uq").on(t.itemId, t.paramId),
    index("item_param_value_param").on(t.paramId),
    check("item_param_value_one", sql`num_nonnulls(${t.number}, ${t.text}, ${t.flag}) = 1`),
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

/** The data sheets (PDF) of an item: what they are, in the history. The file itself is in `item_datasheet_file`. */
export const itemDatasheet = pgTable(
  "item_datasheet",
  {
    id: id(),
    itemId: integer()
      .notNull()
      .references(() => inventoryItem.id, { onDelete: "cascade" }),
    name: text().notNull(),
    sizeBytes: integer().notNull(),
    uploadedBy: integer().references(() => appUser.id, { onDelete: "set null" }),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("item_datasheet_item").on(t.itemId)],
);

/**
 * The bytes of a data sheet, apart from its description: listing the sheets of an item never reads them,
 * and they are read only when somebody opens one. Not in the history (it is binary).
 */
export const itemDatasheetFile = pgTable("item_datasheet_file", {
  datasheetId: integer()
    .primaryKey()
    .references(() => itemDatasheet.id, { onDelete: "cascade" }),
  data: bytea().notNull(),
});

/**
 * Everything that changes what is on the shelf. A receipt brings goods in (from a budget line, or
 * with no budget at all) and freezes their price; a build brings in what the team made, with the
 * cost of its parts frozen; the other kinds take them out, move them or correct the count.
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
    /** Receipts and builds only, per unit: before VAT, with VAT, and what the team pays. */
    unitNet: numeric({ precision: 14, scale: 4 }),
    unitGross: numeric({ precision: 14, scale: 4 }),
    unitTeam: numeric({ precision: 14, scale: 4 }),
    projectId: integer().references(() => project.id, { onDelete: "set null" }),
    /** The purchase this receipt completes. */
    budgetLineId: integer().references(() => budgetLine.id, { onDelete: "set null" }),
    /** A use only: the build (a `build` movement) that took these parts. Undoing the build removes them too. */
    builtBy: integer().references((): AnyPgColumn => stockMovement.id, { onDelete: "cascade" }),
    /**
     * A receipt from outside the budget bought for the car of another season; null = the car of the
     * season of its date. A receipt of the budget follows its line.
     */
    carSeasonId: integer().references(() => season.id),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "stock_movement_quantity",
      sql`(${t.kind} = 'adjustment' and ${t.quantity} <> 0) or (${t.kind} <> 'adjustment' and ${t.quantity} > 0)`,
    ),
    // compared as text: a new value of the enum cannot be used in the migration that adds it
    check(
      "stock_movement_prices",
      sql`(${t.kind}::text in ('receipt', 'build') and ${t.unitNet} is not null and ${t.unitGross} is not null and ${t.unitTeam} is not null)
        or (${t.kind}::text not in ('receipt', 'build') and ${t.unitNet} is null and ${t.unitGross} is null and ${t.unitTeam} is null)`,
    ),
    check("stock_movement_transfer", sql`(${t.kind} = 'transfer') = (${t.toLocation} is not null)`),
    check("stock_movement_built_by", sql`${t.builtBy} is null or ${t.kind} = 'use'`),
    index("stock_movement_built_by").on(t.builtBy),
    index("stock_movement_item").on(t.itemId),
    index("stock_movement_line").on(t.budgetLineId),
    index("stock_movement_project").on(t.projectId),
    index("stock_movement_car").on(t.carSeasonId),
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
    index("component_part_part").on(t.partId),
    check("component_part_quantity", sql`${t.quantity} > 0`),
    check("component_part_not_itself", sql`${t.componentId} <> ${t.partId}`),
  ],
);
