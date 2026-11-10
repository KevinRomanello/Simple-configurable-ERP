import { addDays, totalOf, type Phase } from "@erp/calc";
import { and, asc, desc, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { fromCents, toCents } from "../../core/money";
import { today } from "../../core/today";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { bankSnapshot, cashEntry, teamInflow } from "../../db/schema";
import { canManageCash, getCurrentUser } from "../auth/auth.service";
import { insertEntry, registerBalanceAt } from "../cash/cash.service";
import type { ReceiveInput } from "../cash/cash.schema";
import { assertSeasonOpen, getCurrentSeason } from "../seasons/seasons.service";

type Reader = Pick<Tx, "select">;
type Season = { id: number; startsOn: string; endsOn: string };
type Bank = Awaited<ReturnType<typeof bankOf>>;

/** The inflows and the BANK are the team's money: the treasury keeps them with the admins. */
async function assertCanManageShared() {
  const actor = await getCurrentUser();
  if (!(await canManageCash(actor))) throw forbidden("You cannot change the cash flow");
  return actor;
}

/**
 * An inflow as the cash flow counts it (docs/registro-di-cassa.md, section 5bis). Typed inflows
 * are the expected ones; once the BANK comes from the register an expected inflow that has
 * arrived counts with the day and the amount of its movement, one that should have arrived and
 * has not is late and counts from the day after the BANK, and the actual side is the sponsorship
 * money of the register itself.
 */
export interface InflowView {
  id: number;
  phase: Phase;
  sourceName: string;
  amountCents: number;
  inflowDate: string | null;
  sponsorship: boolean;
  source: "typed" | "register";
  /** The movement of the register that received it. */
  cashEntryId: number | null;
  /** What the register says came in, and on which day. */
  receivedCents: number | null;
  receivedOn: string | null;
  late: boolean;
  /** What the engine counts: the day and the amount (they differ from the typed ones once received or late). */
  countedOn: string | null;
  countedCents: number;
}

export async function loadInflows(reader: Reader, season: Season, bank: Bank): Promise<InflowView[]> {
  const registerDay = bank?.source === "register" ? bank.asOfDate : null;
  const fromRegister = registerDay !== null;
  const rows = await reader
    .select({ inflow: teamInflow, entry: cashEntry })
    .from(teamInflow)
    .leftJoin(cashEntry, eq(teamInflow.cashEntryId, cashEntry.id))
    .where(eq(teamInflow.seasonId, season.id))
    .orderBy(asc(sql`lower(${teamInflow.sourceName})`), asc(teamInflow.inflowDate));

  // with the register, the actual side is its sponsorship money: typed actual inflows are not used
  const typed = rows
    .filter(({ inflow }) => !(fromRegister && inflow.phase === "actual"))
    .map(({ inflow, entry }): InflowView => {
      const cents = toCents(inflow.amount);
      const received = fromRegister && entry ? { on: entry.entryOn, cents: toCents(entry.amount) } : null;
      const late = fromRegister && !entry && inflow.phase === "estimate" && inflow.inflowDate !== null && inflow.inflowDate <= registerDay!;
      return {
        id: inflow.id,
        phase: inflow.phase,
        sourceName: inflow.sourceName,
        amountCents: cents,
        inflowDate: inflow.inflowDate,
        // once the money is in the register, the register says whether it was sponsorship
        sponsorship: entry && fromRegister ? entry.sponsorship : inflow.sponsorship,
        source: "typed",
        cashEntryId: inflow.cashEntryId,
        receivedCents: entry ? toCents(entry.amount) : null,
        receivedOn: entry?.entryOn ?? null,
        late,
        countedOn: received ? received.on : late ? addDays(registerDay!, 1) : inflow.inflowDate,
        countedCents: received ? received.cents : cents,
      };
    });
  if (!fromRegister) return typed;

  const sponsorship = await reader
    .select()
    .from(cashEntry)
    .where(and(gt(cashEntry.amount, "0"), eq(cashEntry.sponsorship, true), gte(cashEntry.entryOn, season.startsOn), lte(cashEntry.entryOn, season.endsOn)))
    .orderBy(asc(sql`lower(${cashEntry.description})`), asc(cashEntry.entryOn));
  const actual = sponsorship.map((e): InflowView => ({
    id: e.id,
    phase: "actual",
    sourceName: e.description,
    amountCents: toCents(e.amount),
    inflowDate: e.entryOn,
    sponsorship: true,
    source: "register",
    cashEntryId: e.id,
    receivedCents: null,
    receivedOn: null,
    late: false,
    countedOn: e.entryOn,
    countedCents: toCents(e.amount),
  }));
  return [...typed, ...actual];
}

/** CASH FLOW inflow tables of a phase, ordered like the old sheet (name, then date). */
export async function listInflows(phase: Phase) {
  const season = await getCurrentSeason();
  const views = await loadInflows(db, season, await bankOf(db, season));
  return views
    .filter((v) => v.phase === phase)
    .map((v) => ({
      id: v.id,
      phase: v.phase,
      sourceName: v.sourceName,
      amount: fromCents(v.amountCents),
      inflowDate: v.inflowDate,
      sponsorship: v.sponsorship,
      source: v.source,
      cashEntryId: v.cashEntryId,
      receivedOn: v.receivedOn,
      receivedAmount: v.receivedCents === null ? null : fromCents(v.receivedCents),
      late: v.late,
    }));
}

export async function createInflow(input: { phase: Phase; sourceName: string; amount: string; inflowDate?: string | null; sponsorship?: boolean }) {
  const actor = await assertCanManageShared();
  const season = await getCurrentSeason();
  return runWrite(actor, async (tx) => {
    await assertSeasonOpen(tx, season.id);
    if (input.phase === "actual" && (await bankOf(tx, season))?.source === "register") {
      throw invalid("With the BANK from the register, the actual inflows are the sponsorship movements of the register: add them there");
    }
    const [created] = await tx
      .insert(teamInflow)
      .values({ seasonId: season.id, ...input, inflowDate: input.inflowDate ?? null })
      .returning();
    return created!;
  });
}

/** The movements of money in that are not tied to an inflow yet, newest first: what "Mark as received" can link to. */
export async function listReceivable() {
  await assertCanManageShared();
  const season = await getCurrentSeason();
  const rows = await db
    .select()
    .from(cashEntry)
    .leftJoin(teamInflow, eq(teamInflow.cashEntryId, cashEntry.id))
    .where(and(gt(cashEntry.amount, "0"), isNull(teamInflow.id), gte(cashEntry.entryOn, season.startsOn), lte(cashEntry.entryOn, season.endsOn)))
    .orderBy(desc(cashEntry.entryOn), desc(cashEntry.id))
    .limit(300);
  return rows.map(({ cash_entry: e }) => ({
    id: e.id,
    on: e.entryOn,
    description: e.description,
    account: e.account,
    amount: e.amount,
    sponsorship: e.sponsorship,
  }));
}

/** An expected inflow has arrived: ties it to a movement of the register, made now or already there. */
export async function receiveInflow(inflowId: number, input: ReceiveInput) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const [inflow] = await tx.select().from(teamInflow).where(eq(teamInflow.id, inflowId)).for("update");
    if (!inflow) throw notFound("Inflow");
    await assertSeasonOpen(tx, inflow.seasonId);
    if (inflow.phase !== "estimate") throw invalid("Only an expected inflow can be marked as received");
    if (inflow.cashEntryId !== null) throw conflict("This inflow is already received: mark it as not received first");

    let entryId: number;
    if ("entryId" in input) {
      const [entry] = await tx.select().from(cashEntry).where(eq(cashEntry.id, input.entryId));
      if (!entry) throw notFound("Movement");
      if (toCents(entry.amount) <= 0) throw invalid("Only money in can receive an inflow");
      const [taken] = await tx.select({ id: teamInflow.id }).from(teamInflow).where(eq(teamInflow.cashEntryId, entry.id));
      if (taken) throw conflict("That movement already received another inflow");
      entryId = entry.id;
    } else {
      const created = await insertEntry(tx, {
        on: input.on,
        description: input.description ?? inflow.sourceName,
        categoryId: input.categoryId,
        methodId: input.methodId,
        account: input.account,
        direction: "in",
        amount: input.amount ?? inflow.amount,
        invoiceChecked: false,
        sponsorship: inflow.sponsorship,
      });
      entryId = created.id;
    }
    await tx.update(teamInflow).set({ cashEntryId: entryId }).where(eq(teamInflow.id, inflowId));
  });
}

/** Takes the link back: the inflow is expected again, the movement stays in the register. */
export async function unreceiveInflow(inflowId: number) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const [inflow] = await tx.select({ seasonId: teamInflow.seasonId }).from(teamInflow).where(eq(teamInflow.id, inflowId)).for("update");
    if (!inflow) throw notFound("Inflow");
    await assertSeasonOpen(tx, inflow.seasonId);
    await tx.update(teamInflow).set({ cashEntryId: null }).where(eq(teamInflow.id, inflowId));
  });
}

export async function deleteInflow(inflowId: number) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select({ seasonId: teamInflow.seasonId }).from(teamInflow).where(eq(teamInflow.id, inflowId));
    if (target) await assertSeasonOpen(tx, target.seasonId);
    const deleted = await tx.delete(teamInflow).where(eq(teamInflow.id, inflowId)).returning({ id: teamInflow.id });
    if (deleted.length === 0) throw notFound("Inflow");
  });
}

/**
 * The BANK of a season: what the register holds in Cassa and Banca on a day, or the balance written
 * by hand when the register cannot say (docs/registro-di-cassa.md, section 5). The day is today, or
 * the last day of a season that is over. Null when there is neither.
 */
export async function bankOf(reader: Pick<Tx, "select">, season: { id: number; endsOn: string }) {
  const day = today() < season.endsOn ? today() : season.endsOn;
  const held = await registerBalanceAt(reader, day);
  if (held) return { amountCents: totalOf(held), asOfDate: day, source: "register" as const };
  const [typed] = await reader.select().from(bankSnapshot).where(eq(bankSnapshot.seasonId, season.id));
  return typed ? { amountCents: toCents(typed.amount), asOfDate: typed.asOfDate, source: "typed" as const } : null;
}

/** The BANK box (GET /api/bank): its balance and day, and whether the register or a person says so. */
export async function getBank() {
  const bank = await bankOf(db, await getCurrentSeason());
  return bank && { amount: fromCents(bank.amountCents), asOfDate: bank.asOfDate, source: bank.source };
}

/** Sets the BANK balance (and the date it refers to, if known). */
export async function setBank(input: { amount: string; asOfDate?: string | null }) {
  const actor = await assertCanManageShared();
  const season = await getCurrentSeason();
  return runWrite(actor, async (tx) => {
    await assertSeasonOpen(tx, season.id);
    const values = { amount: input.amount, asOfDate: input.asOfDate ?? null };
    const [saved] = await tx
      .insert(bankSnapshot)
      .values({ seasonId: season.id, ...values })
      .onConflictDoUpdate({ target: bankSnapshot.seasonId, set: values })
      .returning();
    return saved!;
  });
}

export async function clearBank() {
  const actor = await assertCanManageShared();
  const season = await getCurrentSeason();
  await runWrite(actor, async (tx) => {
    await assertSeasonOpen(tx, season.id);
    await tx.delete(bankSnapshot).where(eq(bankSnapshot.seasonId, season.id));
  });
}
