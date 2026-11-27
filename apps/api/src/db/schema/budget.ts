// The budget's tables: projects, lines and their figures, the funds and their contracts, the suppliers, the inflows of CASH FLOW and the BANK.

import { FUND_TYPES, PHASES, SPONSOR_TYPES } from "@erp/calc";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id } from "./columns";
import { area, season } from "./platform";

export const phaseEnum = pgEnum("phase", PHASES);

export const sponsorTypeEnum = pgEnum("sponsor_type", SPONSOR_TYPES);

export const fundKindEnum = pgEnum("fund_kind", ["team", "external"]);

export const fundTypeEnum = pgEnum("fund_type", FUND_TYPES);

export const project = pgTable(
  "project",
  {
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
  },
  (t) => [index("project_season").on(t.seasonId), index("project_area").on(t.areaId)],
);

export const budgetLine = pgTable(
  "budget_line",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    item: text().notNull(),
    /** What was bought, beside the item: the make and the model, free text (docs/schema-database.md). */
    brand: text(),
    model: text(),
    // Validated by the service against listCategories()/PRIORITIES; plain text on purpose, because
    // categories are hardcoded for now and will become a table (see docs/hardcoded-registry.md).
    category: text(),
    priority: text(),
    note: text(),
    /** Bumped on every change; a write carrying an older version is rejected (optimistic lock). */
    version: integer().notNull().default(1),
    /** Bought for the car of another season (an older car); null = the car of its own season. */
    carSeasonId: integer().references(() => season.id),
  },
  (t) => [index("budget_line_project").on(t.projectId), index("budget_line_car").on(t.carSeasonId)],
);

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
    /**
     * The price of one unit when it was typed with the VAT in it (a receipt, an invoice total): then this is
     * the number that never moves and the net is worked out from it, and `unit_net_cost` is 0. Empty: the price
     * was typed without VAT (`unit_net_cost`). docs/prezzo-lordo.md
     */
    unitGrossCost: numeric({ precision: 14, scale: 4 }),
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
    index("line_figures_supplier").on(t.supplierId),
    check("line_figures_non_negative", sql`${t.quantity} >= 0 and ${t.unitNetCost} >= 0`),
    check("line_figures_one_price", sql`${t.unitGrossCost} is null or (${t.unitGrossCost} >= 0 and ${t.unitNetCost} = 0)`),
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
    /**
     * A fund with no ceiling: there is no sum of money behind it, the team just buys with it (ACTUAL only) and the
     * CASH FROM page says how much was spent. Only for a sponsor that gives a fund (docs/sponsor-e-fondi.md, §10).
     */
    unlimited: boolean().notNull().default(false),
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
    check("fund_unlimited_is_a_sponsor_fund", sql`not ${t.unlimited} or (${t.kind} = 'external' and ${t.type} = 'fund')`),
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
    index("line_fund_fund").on(t.fundId),
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
    /** Sponsorship money is invoiced and owes the VAT on inflows; any other money (a membership fee) does not. */
    sponsorship: boolean().notNull().default(true),
  },
  (t) => [index("team_inflow_season").on(t.seasonId), check("team_inflow_non_negative", sql`${t.amount} >= 0`)],
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
