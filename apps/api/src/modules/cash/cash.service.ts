import { balancesAt, registerTimeline, totalOf, zeroBalances, CASH_ACCOUNTS, type Balances, type CashAccount, type Opening, type RegisterEntry, type YearBalances } from "@erp/calc";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { fromCents, toCents } from "../../core/money";
import { today } from "../../core/today";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, cashCategory, cashEntry, cashEntryLine, cashMethod, cashOpening, project, teamInflow } from "../../db/schema";
import { canManageCash, getCurrentUser } from "../auth/auth.service";
import type { CreateEntryInput, UpdateEntryInput } from "./cash.schema";

// The register of the team's money (docs/registro-di-cassa.md): every movement on Cassa, Banca and
// Paypal. Balances are never stored: they are worked out from the movements at every reading.

type Reader = Pick<Tx, "select">;
type EntryRow = typeof cashEntry.$inferSelect;

/** Only the treasury and the admins: the descriptions carry the names of members and sponsors. */
export async function assertCanManageCash() {
  const actor = await getCurrentUser();
  if (!(await canManageCash(actor))) throw forbidden("Only the treasury and the admins can use the register");
  return actor;
}

const entryOf = (row: EntryRow): RegisterEntry => ({
  id: row.id,
  on: row.entryOn,
  description: row.description,
  categoryId: row.categoryId,
  methodId: row.methodId,
  account: row.account,
  cents: toCents(row.amount),
  invoiceChecked: row.invoiceChecked,
  sponsorship: row.sponsorship,
});

/** Every movement and every opening balance: the register is small, and its balances run through all of it. */
export async function loadRegister(reader: Reader = db): Promise<{ entries: RegisterEntry[]; openings: Opening[] }> {
  const [entries, openings] = await Promise.all([
    reader.select().from(cashEntry).orderBy(asc(cashEntry.entryOn), asc(cashEntry.id)),
    reader.select().from(cashOpening),
  ]);
  return {
    entries: entries.map(entryOf),
    openings: openings.map((o) => ({ year: o.year, account: o.account, cents: toCents(o.amount) })),
  };
}

/** What a year starts and ends with; a year without data starts where the one before ended. */
function yearBalances(years: Map<number, YearBalances>, year: number): YearBalances {
  const found = years.get(year);
  if (found) return found;
  const before = [...years.keys()].filter((y) => y < year).sort((a, b) => a - b).at(-1);
  const carried = before === undefined ? zeroBalances() : years.get(before)!.closing;
  return { opening: carried, closing: carried };
}

/** The register of a year (default: the current one), with the balances after every movement. */
export async function getRegister(year?: number) {
  await assertCanManageCash();
  const thisYear = Number(today().slice(0, 4));
  const shown = year ?? thisYear;
  const { entries, openings } = await loadRegister();
  const { rows, years } = registerTimeline(entries, openings);
  const balances = yearBalances(years, shown);
  const opened = new Set(openings.filter((o) => o.year === shown).map((o) => o.account));
  const links = await loadLinks();
  return {
    year: shown,
    years: [...new Set([thisYear, ...years.keys()])].sort((a, b) => b - a),
    opening: balances.opening,
    /** The accounts whose opening was typed for this year (the others carry over from the year before). */
    openingSet: Object.fromEntries(CASH_ACCOUNTS.map((a) => [a, opened.has(a)])) as Record<CashAccount, boolean>,
    closing: balances.closing,
    total: { opening: totalOf(balances.opening), closing: totalOf(balances.closing) },
    entries: rows
      .filter((r) => r.entry.on.startsWith(String(shown)))
      .map((r) => ({ ...r.entry, balances: r.balances, total: totalOf(r.balances), ...(links.get(r.entry.id) ?? NO_LINKS) })),
  };
}

/** What a movement is tied to: the expected inflow it received, or the budget lines it paid. */
const NO_LINKS = { inflow: null, lines: [] } as { inflow: { id: number; sourceName: string } | null; lines: { lineId: number; item: string; cents: number }[] };

async function loadLinks(reader: Reader = db) {
  const [inflows, lines] = await Promise.all([
    reader.select({ entryId: teamInflow.cashEntryId, id: teamInflow.id, sourceName: teamInflow.sourceName }).from(teamInflow).where(isNotNull(teamInflow.cashEntryId)),
    reader
      .select({ entryId: cashEntryLine.entryId, lineId: cashEntryLine.lineId, item: budgetLine.item, amount: cashEntryLine.amount })
      .from(cashEntryLine)
      .innerJoin(budgetLine, eq(cashEntryLine.lineId, budgetLine.id))
      .orderBy(asc(cashEntryLine.id)),
  ]);
  const byEntry = new Map<number, typeof NO_LINKS>();
  const of = (entryId: number) => byEntry.get(entryId) ?? byEntry.set(entryId, { inflow: null, lines: [] }).get(entryId)!;
  for (const i of inflows) of(i.entryId!).inflow = { id: i.id, sourceName: i.sourceName };
  for (const l of lines) of(l.entryId).lines.push({ lineId: l.lineId, item: l.item, cents: toCents(l.amount) });
  return byEntry;
}

/** What the payments of the register have paid of each ACTUAL line of a season, in cents. */
export async function loadPayments(reader: Reader, seasonId: number) {
  const rows = await reader
    .select({ lineId: cashEntryLine.lineId, amount: sql<string>`sum(${cashEntryLine.amount})` })
    .from(cashEntryLine)
    .innerJoin(budgetLine, eq(cashEntryLine.lineId, budgetLine.id))
    .innerJoin(project, eq(budgetLine.projectId, project.id))
    .where(eq(project.seasonId, seasonId))
    .groupBy(cashEntryLine.lineId);
  return rows.map((r) => ({ lineId: r.lineId, cents: toCents(r.amount) }));
}

/** What the accounts held at the end of a day, for the BANK of CASH FLOW; null if the register knows nothing up to then. */
export async function registerBalanceAt(reader: Reader, date: string): Promise<Balances | null> {
  const { entries, openings } = await loadRegister(reader);
  return balancesAt(entries, openings, date);
}

// --- the movements ---------------------------------------------------------------------------------

export async function assertListed(tx: Tx, categoryId: number | null | undefined, methodId: number | null | undefined) {
  if (categoryId != null) {
    const [found] = await tx.select({ id: cashCategory.id }).from(cashCategory).where(eq(cashCategory.id, categoryId));
    if (!found) throw invalid("That Voce does not exist");
  }
  if (methodId != null) {
    const [found] = await tx.select({ id: cashMethod.id }).from(cashMethod).where(eq(cashMethod.id, methodId));
    if (!found) throw invalid("That payment method does not exist");
  }
}

/** The signed amount as the database stores it, and the sponsorship box, which only money in can have. */
function money(direction: "in" | "out", amount: string, sponsorship: boolean) {
  return { amount: fromCents(direction === "in" ? toCents(amount) : -toCents(amount)), sponsorship: direction === "in" && sponsorship };
}

/** Adds a movement inside a transaction: the register's own form and "Mark as received" both end here. */
export async function insertEntry(tx: Tx, input: CreateEntryInput) {
  await assertListed(tx, input.categoryId, input.methodId);
  const [created] = await tx
    .insert(cashEntry)
    .values({
      entryOn: input.on,
      description: input.description,
      categoryId: input.categoryId,
      methodId: input.methodId,
      account: input.account,
      invoiceChecked: input.invoiceChecked,
      ...money(input.direction, input.amount, input.sponsorship),
    })
    .returning();
  return entryOf(created!);
}

export async function createEntry(input: CreateEntryInput) {
  const actor = await assertCanManageCash();
  return runWrite(actor, (tx) => insertEntry(tx, input));
}

/** A movement that received an inflow stays money in, and one that paid budget lines stays a payment of at least that much. */
async function assertLinksHold(tx: Tx, entryId: number, direction: "in" | "out", cents: number) {
  const [inflow] = await tx.select({ id: teamInflow.id }).from(teamInflow).where(eq(teamInflow.cashEntryId, entryId));
  const [linked] = await tx.select({ amount: sql<string | null>`sum(${cashEntryLine.amount})` }).from(cashEntryLine).where(eq(cashEntryLine.entryId, entryId));
  const paid = linked?.amount == null ? 0 : toCents(linked.amount);
  if (direction === "out" && inflow) throw conflict("This movement received an expected inflow: mark it as not received first");
  if (direction === "in" && paid > 0) throw conflict("This movement paid budget lines: unlink them first");
  if (direction === "out" && cents < paid) throw conflict("This movement paid budget lines for more than that: change the links first");
}

export async function updateEntry(entryId: number, input: UpdateEntryInput) {
  const actor = await assertCanManageCash();
  return runWrite(actor, async (tx) => {
    const [current] = await tx.select().from(cashEntry).where(eq(cashEntry.id, entryId)).for("update");
    if (!current) throw notFound("Movement");
    await assertListed(tx, input.categoryId, input.methodId);
    const cents = toCents(current.amount);
    const direction = input.direction ?? (cents > 0 ? "in" : "out");
    const amount = input.amount ?? fromCents(Math.abs(cents));
    await assertLinksHold(tx, entryId, direction, toCents(amount));
    const [updated] = await tx
      .update(cashEntry)
      .set({
        ...(input.on !== undefined ? { entryOn: input.on } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.methodId !== undefined ? { methodId: input.methodId } : {}),
        ...(input.account !== undefined ? { account: input.account } : {}),
        ...(input.invoiceChecked !== undefined ? { invoiceChecked: input.invoiceChecked } : {}),
        ...money(direction, amount, input.sponsorship ?? current.sponsorship),
      })
      .where(eq(cashEntry.id, entryId))
      .returning();
    return entryOf(updated!);
  });
}

export async function deleteEntry(entryId: number) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    const deleted = await tx.delete(cashEntry).where(eq(cashEntry.id, entryId)).returning({ id: cashEntry.id });
    if (deleted.length === 0) throw notFound("Movement");
  });
}

/** Sets what an account held on 1 January of a year; without an amount the year starts from the year before again. */
export async function setOpening(input: { year: number; account: CashAccount; amount: string | null }) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    const same = and(eq(cashOpening.year, input.year), eq(cashOpening.account, input.account));
    if (input.amount === null) {
      await tx.delete(cashOpening).where(same);
      return;
    }
    await tx
      .insert(cashOpening)
      .values({ year: input.year, account: input.account, amount: input.amount })
      .onConflictDoUpdate({ target: [cashOpening.year, cashOpening.account], set: { amount: input.amount } });
  });
}
