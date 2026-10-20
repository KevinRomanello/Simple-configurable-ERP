import { PHASES, SPONSOR_TYPES } from "@erp/calc";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Money columns are `numeric` (exact). Drizzle returns them as strings; core/money.ts is the
// only place that converts them to the integer units the calculation engine works with.
// Dates are plain `date` columns, returned as ISO strings (YYYY-MM-DD).

export const phaseEnum = pgEnum("phase", PHASES);
export const sponsorTypeEnum = pgEnum("sponsor_type", SPONSOR_TYPES);
export const fundKindEnum = pgEnum("fund_kind", ["team", "external"]);

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
    fundId: integer().references(() => fund.id),
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
    // One flag per phase, like the two checkboxes of the old sheet (open question Q5).
    paysVatEstimate: boolean().notNull().default(false),
    paysVatActual: boolean().notNull().default(false),
  },
  (t) => [
    uniqueIndex("fund_season_name_uq").on(t.seasonId, sql`lower(${t.name})`),
    uniqueIndex("fund_one_team_per_season")
      .on(t.seasonId)
      .where(sql`${t.kind} = 'team'`),
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
  (t) => [check("fund_contract_non_negative", sql`${t.amount} >= 0`)],
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

/** A single supplier list (the old sheet had one per phase). Not tied to a season. */
export const supplier = pgTable(
  "supplier",
  {
    id: id(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("supplier_name_uq").on(sql`lower(${t.name})`)],
);
