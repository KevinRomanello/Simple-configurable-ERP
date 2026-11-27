import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { CashAccount } from "@erp/calc";
import type { Db } from "../../core/contracts";
import { toCents } from "../../core/money";
import { cashCategory, cashEntry } from "../../db/schema/treasury";

// What other owners ask of the register: movements as plain facts, never rows of the database. The bridge to the budget reads the
// register only through these (treasury.public.ts), then ties what it reads to the budget by its own tables.

/** One movement of the register. `amount` is the decimal as it is stored (money out is negative), `cents` the same as a whole number. */
export interface EntryFact {
  id: number;
  on: string;
  description: string;
  account: CashAccount;
  amount: string;
  cents: number;
  categoryId: number | null;
  methodId: number | null;
  sponsorship: boolean;
}

export interface DayRange {
  from: string;
  to: string;
}

const factOf = (e: typeof cashEntry.$inferSelect): EntryFact => ({
  id: e.id,
  on: e.entryOn,
  description: e.description,
  account: e.account,
  amount: e.amount,
  cents: toCents(e.amount),
  categoryId: e.categoryId,
  methodId: e.methodId,
  sponsorship: e.sponsorship,
});

const within = (range: DayRange) => and(gte(cashEntry.entryOn, range.from), lte(cashEntry.entryOn, range.to));

/** The movements with these ids (the ones that exist); `lock` keeps them from changing until the transaction ends. */
export async function entriesByIds(db: Db, ids: number[], lock = false): Promise<EntryFact[]> {
  if (ids.length === 0) return [];
  const query = db.select().from(cashEntry).where(inArray(cashEntry.id, ids));
  return (lock ? await query.for("update") : await query).map(factOf);
}

/** The money that came in on those days, newest first. */
export async function moneyInBetween(db: Db, range: DayRange): Promise<EntryFact[]> {
  return (await db.select().from(cashEntry).where(and(gt(cashEntry.amount, "0"), within(range))).orderBy(desc(cashEntry.entryOn), desc(cashEntry.id))).map(factOf);
}

/**
 * The payments (money out) of those days that can be for a line of the budget, newest first: a payment of a Voce outside the budget is in
 * the derived area, and one the budget ignores is nobody's, so neither is here.
 */
export async function paymentsBetween(db: Db, range: DayRange): Promise<EntryFact[]> {
  const rows = await db
    .select()
    .from(cashEntry)
    .where(
      and(
        lt(cashEntry.amount, "0"),
        within(range),
        or(isNull(cashEntry.categoryId), inArray(cashEntry.categoryId, db.select({ id: cashCategory.id }).from(cashCategory).where(eq(cashCategory.scope, "project")))),
      ),
    )
    .orderBy(desc(cashEntry.entryOn), desc(cashEntry.id));
  return rows.map(factOf);
}

/** The money that came in ticked as sponsorship, in the order of the old sheet (name, then day). */
export async function sponsorshipMoneyBetween(db: Db, range: DayRange): Promise<EntryFact[]> {
  const rows = await db
    .select()
    .from(cashEntry)
    .where(and(gt(cashEntry.amount, "0"), eq(cashEntry.sponsorship, true), within(range)))
    .orderBy(asc(sql`lower(${cashEntry.description})`), asc(cashEntry.entryOn));
  return rows.map(factOf);
}

/** A movement whose Voce is spent outside the budget (a stamp duty, a membership fee), with the name of that Voce. */
export interface OutsideFact {
  id: number;
  on: string;
  voce: string;
  cents: number;
}

/** The movements of those days whose Voce is outside the budget and that are not ticked as sponsorship, oldest first. */
export async function outsideBetween(db: Db, range: DayRange): Promise<OutsideFact[]> {
  const rows = await db
    .select({ id: cashEntry.id, on: cashEntry.entryOn, voce: cashCategory.name, amount: cashEntry.amount })
    .from(cashEntry)
    .innerJoin(cashCategory, eq(cashEntry.categoryId, cashCategory.id))
    .where(and(eq(cashCategory.scope, "outside"), within(range), eq(cashEntry.sponsorship, false)))
    .orderBy(asc(cashEntry.entryOn), asc(cashEntry.id));
  return rows.map((r) => ({ id: r.id, on: r.on, voce: r.voce, cents: toCents(r.amount) }));
}

/** The method of the last payment, for the form that pays the lines; null if there is none. */
export async function lastPaymentMethodId(db: Db): Promise<number | null> {
  const [last] = await db
    .select({ methodId: cashEntry.methodId })
    .from(cashEntry)
    .where(and(lt(cashEntry.amount, "0"), isNotNull(cashEntry.methodId)))
    .orderBy(desc(cashEntry.entryOn), desc(cashEntry.id))
    .limit(1);
  return last?.methodId ?? null;
}
