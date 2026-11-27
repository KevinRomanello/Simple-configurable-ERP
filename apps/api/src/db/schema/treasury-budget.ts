// What needs both the register and the budget: the payments of the register that pay lines of the budget, the movement that received an
// expected inflow, the Voce a payment for a category of the budget starts from, and the orders (several lines bought together).

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id } from "./columns";
import { budgetLine, teamInflow } from "./budget";
import { category, season } from "./platform";
import { cashCategory, cashEntry } from "./treasury";

/** A payment of the register that pays (part of) a budget line: what it paid of the team fund's purchase. */
export const cashEntryLine = pgTable(
  "cash_entry_line",
  {
    id: id(),
    entryId: integer()
      .notNull()
      .references(() => cashEntry.id, { onDelete: "cascade" }),
    lineId: integer()
      .notNull()
      .references(() => budgetLine.id, { onDelete: "cascade" }),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    unique("cash_entry_line_uq").on(t.entryId, t.lineId),
    index("cash_entry_line_line").on(t.lineId),
    check("cash_entry_line_amount", sql`${t.amount} > 0`),
  ],
);

/**
 * The movement of the register that received an expected inflow of CASH FLOW. An inflow has one movement and a movement one inflow (the
 * two keys are unique); deleting either takes the link away and leaves the other, which is then «not received» (or just a movement).
 */
export const inflowReceipt = pgTable("inflow_receipt", {
  id: id(),
  inflowId: integer()
    .notNull()
    .unique()
    .references(() => teamInflow.id, { onDelete: "cascade" }),
  entryId: integer()
    .notNull()
    .unique()
    .references(() => cashEntry.id, { onDelete: "cascade" }),
});

/** The Voce of the register a payment for a line of a category of the budget starts from (the treasury changes it when paying). */
export const categoryVoce = pgTable(
  "category_voce",
  {
    id: id(),
    categoryId: integer()
      .notNull()
      .unique()
      .references(() => category.id, { onDelete: "cascade" }),
    voceId: integer()
      .notNull()
      .references(() => cashCategory.id, { onDelete: "cascade" }),
  },
  (t) => [index("category_voce_voce").on(t.voceId)],
);

/**
 * An order: lines of the budget bought together (one order, one invoice, one bank transfer), in TO PAY a row of its own
 * (docs/registro-di-cassa.md, section 5.3). Of one season, like its lines; its name is unique in the season, whatever the case.
 * Called `purchase_order` because `order` is a word of SQL.
 */
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: id(),
    seasonId: integer()
      .notNull()
      .references(() => season.id, { onDelete: "cascade" }),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("purchase_order_season_name_uq").on(t.seasonId, sql`lower(${t.name})`), check("purchase_order_name", sql`length(trim(${t.name})) > 0`)],
);

/**
 * A line of the budget in an order: a line is in one order at most. An order whose last line goes (taken out, moved to another order,
 * deleted from the budget) goes too: the trigger `order_line_drop_empty_order` of the migration does it, in the same transaction.
 */
export const orderLine = pgTable(
  "order_line",
  {
    id: id(),
    lineId: integer()
      .notNull()
      .unique()
      .references(() => budgetLine.id, { onDelete: "cascade" }),
    orderId: integer()
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
  },
  (t) => [index("order_line_order").on(t.orderId)],
);
