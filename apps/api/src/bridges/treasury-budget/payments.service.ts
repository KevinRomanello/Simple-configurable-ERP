import { toPayLines, type CalcLine } from "@erp/calc";
import { eq } from "drizzle-orm";
import { invalid, notFound } from "../../core/errors";
import { fromCents, toCents } from "../../core/money";
import { today } from "../../core/today";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { category } from "../../db/schema/platform";
import { cashEntryLine, categoryVoce } from "../../db/schema/treasury-budget";
import { allSeasons, assertSeasonOpen, getCurrentSeason, getSeasonById } from "../../platform/seasons/seasons.service";
import { computedLines, seasonsOfLines } from "../../modules/budget/budget.public";
import { assertCanManageCash, entriesByIds, insertEntry, lastPaymentMethodId, paymentsBetween } from "../../modules/treasury/treasury.public";
import { payingEntries } from "./links.service";
import type { PayInput } from "./treasury-budget.schema";

// The payments of the register tied to the lines of the budget (docs/registro-di-cassa.md, section 5.3): a
// payment can cover several lines, and a line can be paid in instalments. A payment covers what the team pays
// for a line: the net out of its fund first, then the VAT.

export interface PayableLine {
  lineId: number;
  item: string;
  project: string;
  /** What the team pays of the line (ACTUAL): the net out of its fund, and the VAT. */
  teamFundCents: number;
  teamVatCents: number;
  /** The two together: the most a payment can cover. */
  totalCents: number;
  /** What every payment has paid of it, this one included. */
  paidCents: number;
}

const payableOf = (l: CalcLine): PayableLine => ({
  lineId: l.id,
  item: l.item,
  project: l.projectName,
  teamFundCents: l.actual.teamFundCents,
  teamVatCents: l.actual.teamVatCents,
  totalCents: l.actual.teamFundCents + l.actual.teamVatCents,
  paidCents: l.actual.paidCents,
});

/** The ACTUAL lines of the season that the team pays for (the only ones a payment can be tied to), with how much is paid. */
export async function listPayableLines(): Promise<PayableLine[]> {
  await assertCanManageCash();
  return (await computedLines(await getCurrentSeason())).map(payableOf).filter((l) => l.totalCents > 0);
}

/** A payment never covers more of a line than the team pays for it, with the other payments of the line. */
function assertFits(line: PayableLine | undefined, othersCents: number, cents: number) {
  if (!line || line.totalCents <= 0) throw invalid("A payment can only be tied to a line that the team pays for (ACTUAL)");
  if (othersCents + cents > line.totalCents) throw invalid(`The payments of "${line.item}" cannot exceed what the team pays for it`);
}

/** The amounts of a request, by line: above zero, each line once. */
function amountsOf(lines: { lineId: number; amount: string }[]): Map<number, number> {
  const wanted = new Map<number, number>();
  for (const l of lines) {
    if (wanted.has(l.lineId)) throw invalid("A line can be listed only once");
    const cents = toCents(l.amount);
    if (cents <= 0) throw invalid("Every amount must be above zero");
    wanted.set(l.lineId, cents);
  }
  return wanted;
}

/**
 * Sets which lines of the budget a payment paid and how much of each: the links of the season chosen
 * in the menu are replaced, those of other seasons stay. The lines are the ACTUAL ones the team pays for;
 * the payments of a line never exceed that, and a payment never covers more than it is.
 */
export async function setEntryLines(entryId: number, lines: { lineId: number; amount: string }[]) {
  const actor = await assertCanManageCash();
  const season = await getCurrentSeason();
  const payable = new Map((await computedLines(season)).map((l) => [l.id, payableOf(l)]));
  return runWrite(actor, async (tx) => {
    await assertSeasonOpen(tx, season.id);
    const [entry] = await entriesByIds(tx, [entryId], true);
    if (!entry) throw notFound("Movement");
    const outCents = -entry.cents;
    if (outCents <= 0) throw invalid("Only a payment (money out) can be tied to budget lines");

    const wanted = amountsOf(lines);
    for (const [lineId, cents] of wanted) {
      // what the other payments paid of it, so that this one does not take it above what the team pays
      const others = await tx.select({ entryId: cashEntryLine.entryId, amount: cashEntryLine.amount }).from(cashEntryLine).where(eq(cashEntryLine.lineId, lineId));
      const othersCents = others.filter((o) => o.entryId !== entryId).reduce((sum, o) => sum + toCents(o.amount), 0);
      assertFits(payable.get(lineId), othersCents, cents);
    }
    // the part of this payment that stays in other seasons counts against the movement too
    const existing = await tx.select({ id: cashEntryLine.id, lineId: cashEntryLine.lineId, amount: cashEntryLine.amount }).from(cashEntryLine).where(eq(cashEntryLine.entryId, entryId));
    const seasonOf = await seasonsOfLines(tx, existing.map((r) => r.lineId));
    const inSeason = existing.filter((r) => seasonOf.get(r.lineId) === season.id);
    const elsewhere = existing.filter((r) => seasonOf.has(r.lineId) && seasonOf.get(r.lineId) !== season.id).reduce((sum, r) => sum + toCents(r.amount), 0);
    const total = [...wanted.values()].reduce((sum, c) => sum + c, 0) + elsewhere;
    if (total > outCents) throw invalid("The lines add up to more than the payment");

    for (const row of inSeason) await tx.delete(cashEntryLine).where(eq(cashEntryLine.id, row.id));
    if (wanted.size > 0) {
      await tx.insert(cashEntryLine).values([...wanted].map(([lineId, cents]) => ({ entryId, lineId, amount: fromCents(cents) })));
    }
  });
}

// --- TO PAY ------------------------------------------------------------------------------------

/**
 * What the team still has to pay of the lines bought (the page TO PAY): the lines of the season chosen in the
 * menu, or of every season; with the Voce each category starts from and the method of the last payment, for the
 * form that pays them.
 */
export async function listToPay(everySeason: boolean) {
  await assertCanManageCash();
  const seasons = everySeason ? await allSeasons() : [await getCurrentSeason()];
  const voceOf = new Map((await db.select({ name: category.name, voceId: categoryVoce.voceId }).from(category).leftJoin(categoryVoce, eq(categoryVoce.categoryId, category.id))).map((c) => [c.name.toLowerCase(), c.voceId]));
  const rows = [];
  for (const season of seasons) {
    for (const row of toPayLines(await computedLines(season), today())) {
      rows.push({ ...row, seasonId: season.id, seasonName: season.name, suggestedCategoryId: row.category ? (voceOf.get(row.category.toLowerCase()) ?? null) : null });
    }
  }
  return { rows, lastMethodId: await lastPaymentMethodId(db) };
}

/**
 * Pays lines of the budget: one new movement of money out, as much as the lines add up to, tied to each of them
 * (one bank transfer can pay several lines of a supplier). All or nothing. A line can be paid in part, but never
 * more than the team still owes for it.
 */
export async function payLines(input: PayInput) {
  const actor = await assertCanManageCash();
  const wanted = amountsOf(input.lines);

  // the seasons of the lines, and what the team owes for each
  const seasonOf = await seasonsOfLines(db, [...wanted.keys()]);
  if (seasonOf.size !== wanted.size) throw notFound("Line");
  const seasonIds = [...new Set(seasonOf.values())];
  const payable = new Map<number, PayableLine>();
  for (const seasonId of seasonIds) {
    for (const l of await computedLines(await getSeasonById(seasonId))) payable.set(l.id, payableOf(l));
  }

  return runWrite(actor, async (tx) => {
    for (const seasonId of seasonIds) await assertSeasonOpen(tx, seasonId);
    let total = 0;
    for (const [lineId, cents] of wanted) {
      const line = payable.get(lineId);
      assertFits(line, line?.paidCents ?? 0, cents);
      total += cents;
    }
    const items = [...wanted.keys()].map((id) => payable.get(id)!.item);
    const entry = await insertEntry(tx, {
      on: input.on,
      description: input.description?.trim() || items.join(", ").slice(0, 500),
      categoryId: input.categoryId,
      methodId: input.methodId,
      account: input.account,
      direction: "out",
      amount: fromCents(total),
      invoiceChecked: false,
      sponsorship: false,
    });
    await tx.insert(cashEntryLine).values([...wanted].map(([lineId, cents]) => ({ entryId: entry.id, lineId, amount: fromCents(cents) })));
    return entry;
  });
}

/** The payments of the season chosen in the menu that pay no line yet, newest first: the ones the page TO PAY offers to tie. */
export async function listToLink() {
  await assertCanManageCash();
  const season = await getCurrentSeason();
  // a payment of a Voce outside the budget is in the derived area, and one the budget ignores is nobody's: the register leaves both out
  const payments = await paymentsBetween(db, { from: season.startsOn, to: season.endsOn });
  const paying = await payingEntries(db, payments.map((p) => p.id));
  return payments
    .filter((p) => !paying.has(p.id))
    .slice(0, 300)
    .map((e) => ({ id: e.id, on: e.on, description: e.description, account: e.account, cents: e.cents, categoryId: e.categoryId, methodId: e.methodId, lines: [] }));
}
