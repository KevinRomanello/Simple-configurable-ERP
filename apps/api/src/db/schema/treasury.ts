// The register of the team's money (docs/registro-di-cassa.md): the movements, their Voci and methods, and the balances of the year's start.

import { CASH_ACCOUNTS, type CashScope } from "@erp/calc";
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

/** The three places the team's money is kept: the cash box, the bank account, the Paypal account. */
export const cashAccountEnum = pgEnum("cash_account", CASH_ACCOUNTS);

// --- the register of the team's money (docs/registro-di-cassa.md) -------------------------------

/** The "Voce" of a movement ("2.1 da soci e tesserati"): the lists live in Settings. */
export const cashCategory = pgTable(
  "cash_category",
  {
    id: id(),
    name: text().notNull(),
    position: integer().notNull(),
    /** Money that comes in on this Voce is sponsorship unless said otherwise on the movement (a starting value only). */
    sponsorship: boolean().notNull().default(false),
    /**
     * Where the money of this Voce counts: `project` is spent on a budget line (it counts through the line it is tied
     * to); `outside` is not in the budget (a stamp duty, a membership fee) and counts in the derived area; `ignore`
     * never counts there. docs/spese-fuori-budget.md
     */
    scope: text().notNull().default("project").$type<CashScope>(),
  },
  (t) => [
    uniqueIndex("cash_category_name_uq").on(sql`lower(${t.name})`),
    check("cash_category_scope_known", sql`${t.scope} in ('project', 'outside', 'ignore')`),
  ],
);

/** How a payment was made ("Completato bonifico", "Paypal"...): a list in Settings. */
export const cashMethod = pgTable(
  "cash_method",
  {
    id: id(),
    name: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [uniqueIndex("cash_method_name_uq").on(sql`lower(${t.name})`)],
);

/** One movement of money: on one account, in (positive) or out (negative). Balances are never stored. */
export const cashEntry = pgTable(
  "cash_entry",
  {
    id: id(),
    entryOn: date().notNull(),
    description: text().notNull().default(""),
    categoryId: integer().references(() => cashCategory.id),
    methodId: integer().references(() => cashMethod.id),
    /** Where the money moved; the method says how it was paid (a Paypal payment can leave the bank account). */
    account: cashAccountEnum().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    /** The "Check fattura" box of the sheet. */
    invoiceChecked: boolean().notNull().default(false),
    /** Money in only: it owes the VAT on inflows, like an inflow of CASH FLOW. */
    sponsorship: boolean().notNull().default(false),
  },
  (t) => [
    index("cash_entry_on").on(t.entryOn),
    index("cash_entry_category").on(t.categoryId),
    index("cash_entry_method").on(t.methodId),
    check("cash_entry_amount", sql`${t.amount} <> 0`),
    check("cash_entry_sponsorship", sql`not ${t.sponsorship} or ${t.amount} > 0`),
  ],
);

/** What an account held on 1 January of a year; a year without one starts from where the year before ended. */
export const cashOpening = pgTable(
  "cash_opening",
  {
    id: id(),
    year: integer().notNull(),
    account: cashAccountEnum().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
  },
  (t) => [unique("cash_opening_year_account_uq").on(t.year, t.account)],
);
