import { addDays, type Phase } from "@erp/calc";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { contracts, type Db } from "../../core/contracts";
import { forbidden, invalid, notFound } from "../../core/errors";
import { fromCents, toCents } from "../../core/money";
import { today } from "../../core/today";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { bankSnapshot, teamInflow } from "../../db/schema/budget";
import { canChangeInflows, canManageCash, getCurrentUser } from "../../platform/auth/auth.service";
import { currentActive } from "../../platform/platform.public";
import { assertSeasonOpen, getCurrentSeason } from "../../platform/seasons/seasons.service";
import { inflowDeleting, inflowReceipts, registerBank, registerSponsorship } from "../budget/budget.ports";

type Reader = Pick<Tx, "select">;
type Season = { id: number; startsOn: string; endsOn: string };
type Bank = Awaited<ReturnType<typeof bankOf>>;

/** The BANK is the team's money: the treasury keeps it with the admins. */
async function assertCanManageShared() {
  const actor = await getCurrentUser();
  if (!(await canManageCash(actor))) throw forbidden("You cannot change the cash flow");
  return actor;
}

/** Adding and deleting inflows is also for the sponsors: some inflows are their money. Receiving them and the BANK are not. */
export async function assertCanChangeInflows() {
  const actor = await getCurrentUser();
  if (!(await canChangeInflows(actor))) throw forbidden("You cannot change the inflows");
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

export async function loadInflows(reader: Db, season: Season, bank: Bank): Promise<InflowView[]> {
  const registerDay = bank?.source === "register" ? bank.asOfDate : null;
  const fromRegister = registerDay !== null;
  const rows = await reader
    .select()
    .from(teamInflow)
    .where(eq(teamInflow.seasonId, season.id))
    .orderBy(asc(sql`lower(${teamInflow.sourceName})`), asc(teamInflow.inflowDate), asc(teamInflow.id));
  // which expected inflows arrived, and with what movement of the register (none, when there is no register)
  const receipts = new Map((await contracts.ask(inflowReceipts, currentActive(), reader, { inflowIds: rows.map((r) => r.id) })).map((r) => [r.inflowId, r]));

  // with the register, the actual side is its sponsorship money: typed actual inflows are not used
  const typed = rows
    .filter((inflow) => !(fromRegister && inflow.phase === "actual"))
    .map((inflow): InflowView => {
      const receipt = receipts.get(inflow.id);
      const cents = toCents(inflow.amount);
      const received = fromRegister && receipt ? { on: receipt.on, cents: receipt.cents } : null;
      const late = fromRegister && !receipt && inflow.phase === "estimate" && inflow.inflowDate !== null && inflow.inflowDate <= registerDay!;
      return {
        id: inflow.id,
        phase: inflow.phase,
        sourceName: inflow.sourceName,
        amountCents: cents,
        inflowDate: inflow.inflowDate,
        // once the money is in the register, the register says whether it was sponsorship
        sponsorship: receipt && fromRegister ? receipt.sponsorship : inflow.sponsorship,
        source: "typed",
        cashEntryId: receipt?.entryId ?? null,
        receivedCents: receipt?.cents ?? null,
        receivedOn: receipt?.on ?? null,
        late,
        countedOn: received ? received.on : late ? addDays(registerDay!, 1) : inflow.inflowDate,
        countedCents: received ? received.cents : cents,
      };
    });
  if (!fromRegister) return typed;

  const sponsorship = await contracts.ask(registerSponsorship, currentActive(), reader, { from: season.startsOn, to: season.endsOn });
  const actual = sponsorship.map((e): InflowView => ({
    id: e.id,
    phase: "actual",
    sourceName: e.description,
    amountCents: e.cents,
    inflowDate: e.on,
    sponsorship: true,
    source: "register",
    cashEntryId: e.id,
    receivedCents: null,
    receivedOn: null,
    late: false,
    countedOn: e.on,
    countedCents: e.cents,
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
  const actor = await assertCanChangeInflows();
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

export async function deleteInflow(inflowId: number) {
  const actor = await assertCanChangeInflows();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select({ seasonId: teamInflow.seasonId }).from(teamInflow).where(eq(teamInflow.id, inflowId));
    if (target) await assertSeasonOpen(tx, target.seasonId);
    // whoever tied the inflow to something (the register that received it) may refuse
    await contracts.emit(inflowDeleting, currentActive(), tx, { inflowId, actor });
    const deleted = await tx.delete(teamInflow).where(eq(teamInflow.id, inflowId)).returning({ id: teamInflow.id });
    if (deleted.length === 0) throw notFound("Inflow");
  });
}

// --- what the bridge to the treasury reads and deletes of the inflows -----------------------------

/** An expected or actual inflow as the budget keeps it; `amount` is the decimal as it is stored. */
export interface InflowFact {
  id: number;
  seasonId: number;
  phase: Phase;
  sourceName: string;
  amount: string;
  inflowDate: string | null;
  sponsorship: boolean;
}

const factOf = (row: typeof teamInflow.$inferSelect): InflowFact => ({
  id: row.id,
  seasonId: row.seasonId,
  phase: row.phase,
  sourceName: row.sourceName,
  amount: row.amount,
  inflowDate: row.inflowDate,
  sponsorship: row.sponsorship,
});

/** The inflows with these ids (the ones that exist); `lock` keeps them from changing until the transaction ends. */
export async function inflowsByIds(reader: Reader, ids: number[], lock = false): Promise<InflowFact[]> {
  if (ids.length === 0) return [];
  const query = reader.select().from(teamInflow).where(inArray(teamInflow.id, ids));
  return (lock ? await query.for("update") : await query).map(factOf);
}

/** Every inflow of a season, expected and actual. */
export async function inflowsOfSeason(reader: Reader, seasonId: number): Promise<InflowFact[]> {
  return (await reader.select().from(teamInflow).where(eq(teamInflow.seasonId, seasonId))).map(factOf);
}

/** Deletes inflows inside a transaction that is already open. */
export async function deleteInflowsIn(tx: Tx, ids: number[]) {
  if (ids.length > 0) await tx.delete(teamInflow).where(inArray(teamInflow.id, ids));
}

/**
 * The BANK of a season: what the register holds in Cassa and Banca on a day (the register is asked through a port, and answers only
 * when the treasury is on), or the balance written by hand when it cannot say (docs/registro-di-cassa.md, section 5). The day is today, or
 * the last day of a season that is over. Null when there is neither.
 */
export async function bankOf(reader: Db, season: { id: number; endsOn: string }) {
  const day = today() < season.endsOn ? today() : season.endsOn;
  const held = await contracts.ask(registerBank, currentActive(), reader, { day });
  if (held) return { amountCents: held.amountCents, asOfDate: day, source: "register" as const };
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
