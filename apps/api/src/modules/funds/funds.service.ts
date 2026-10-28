import type { FundType, Phase } from "@erp/calc";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { fund, fundContract, lineFund } from "../../db/schema";
import { canWrite, getCurrentUser } from "../auth/auth.service";
import { getFixedSponsorRates, listVatRates } from "../lookups/lookups.service";
import { getCurrentSeason } from "../seasons/seasons.service";
import { ensureSupplier, renameSupplier } from "../suppliers/suppliers.service";

async function assertCanManageShared() {
  const actor = await getCurrentUser();
  if (!(await canWrite(actor, null))) throw forbidden("You cannot change funds");
  return actor;
}

type FundRow = typeof fund.$inferSelect;

/** What a sponsor brings in one phase: a value and the day it arrives. */
interface Money {
  amount: string;
  inflowDate: string | null;
}
type MoneyByPhase = Record<Phase, Money | null>;

/** The money of each of the given funds, by phase. */
async function moneyOf(executor: Pick<Tx, "select">, fundIds: number[]): Promise<Map<number, MoneyByPhase>> {
  const result = new Map<number, MoneyByPhase>();
  if (fundIds.length === 0) return result;
  const rows = await executor.select().from(fundContract).where(inArray(fundContract.fundId, fundIds));
  for (const row of rows) {
    const entry = result.get(row.fundId) ?? { estimate: null, actual: null };
    entry[row.phase] = { amount: row.amount, inflowDate: row.inflowDate };
    result.set(row.fundId, entry);
  }
  return result;
}
const NO_MONEY: MoneyByPhase = { estimate: null, actual: null };

/** A fund as the API serves it: the VAT rate as a number, the group under its public name, its money. */
function fundOut(row: FundRow, money: MoneyByPhase = NO_MONEY) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    type: row.type,
    vatRate: row.vatRate === null ? null : Number(row.vatRate),
    group: row.groupName,
    contracts: money,
  };
}

/**
 * The funds a line can be paid from in a phase: the team fund, every gift (it needs no money) and
 * every sponsor that has a contract in that phase (GET /api/funds?phase=). Without a phase, every fund.
 */
export async function listFunds(phase?: Phase) {
  const season = await getCurrentSeason();
  const inSeason = eq(fund.seasonId, season.id);
  const hasContract = (p: Phase) =>
    exists(
      db.select({ one: sql`1` }).from(fundContract).where(and(eq(fundContract.fundId, fund.id), eq(fundContract.phase, p))),
    );
  const rows = await db
    .select()
    .from(fund)
    .where(
      phase
        ? and(inSeason, sql`(${fund.kind} = 'team' or ${fund.type} <> 'fund' or ${hasContract(phase)})`)
        : inSeason,
    )
    .orderBy(sql`${fund.kind} = 'team' desc`, sql`lower(${fund.name})`);
  const money = await moneyOf(db, rows.map((r) => r.id));
  return rows.map((row) => fundOut(row, money.get(row.id)));
}

// --- sponsors: the definition of a fund ---------------------------------------------------------

export interface SponsorInput {
  name: string;
  type: FundType;
  vatRate: number | null;
  group: string | null;
}

/** The money a new sponsor brings: one contract per phase it counts in. */
export interface ContractInput {
  phase: Phase;
  amount: string;
  inflowDate: string | null;
}

/** The rules every sponsor must follow; gives back the VAT rate to store. */
async function checkedRate(input: Pick<SponsorInput, "type" | "vatRate">): Promise<number> {
  // some kinds of sponsor have their rate fixed (a plain gift owes none, a counter-invoice always the same):
  // it does not depend on the rates an admin lets people choose
  const fixed = (await getFixedSponsorRates())[input.type];
  if (fixed !== undefined) return fixed;
  const rate = input.vatRate;
  if (rate === null) throw invalid("Choose the VAT rate of the sponsor");
  if (!(await listVatRates()).includes(rate)) throw invalid(`VAT rate ${rate}% is not one of the allowed rates`);
  return rate;
}

const sponsorValues = (input: SponsorInput, rate: number) => ({
  name: input.name,
  type: input.type,
  vatRate: rate.toFixed(2),
  groupName: input.group,
});

/**
 * Adds a sponsor ("INSERT COMPANY"), with the money it brings if already known: its contracts,
 * with value and date, can also be added later. Sponsor and contracts are saved together or not at all.
 */
export async function createFund(input: SponsorInput, contracts: ContractInput[] = []) {
  const actor = await assertCanManageShared();
  const season = await getCurrentSeason();
  const rate = await checkedRate(input);
  if (contracts.length > 0 && input.type !== "fund") {
    throw invalid("A sponsor that gives goods has no contract: it is not a sum of money");
  }
  if (new Set(contracts.map((c) => c.phase)).size !== contracts.length) {
    throw invalid("A sponsor has one contract per phase");
  }
  return runWrite(actor, async (tx) => {
    const [created] = await tx
      .insert(fund)
      .values({ seasonId: season.id, kind: "external", ...sponsorValues(input, rate) })
      .onConflictDoNothing() // the same name at the same moment: the first one wins
      .returning();
    if (!created) throw conflict(`"${input.name}" already exists`);
    if (input.type !== "fund") await ensureSupplier(tx, input.name); // goods come from a supplier: the sponsor
    for (const contract of contracts) {
      await tx.insert(fundContract).values({
        fundId: created.id,
        phase: contract.phase,
        amount: contract.amount,
        inflowDate: contract.inflowDate,
      });
    }
    return fundOut(created, (await moneyOf(tx, [created.id])).get(created.id));
  });
}

/** Changes the definition of a sponsor; what is left out stays as it is. */
export async function updateFund(fundId: number, input: Partial<SponsorInput>) {
  const actor = await assertCanManageShared();
  return runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(fund).where(eq(fund.id, fundId)).for("update");
    if (!target) throw notFound("Fund");
    if (target.kind === "team") throw invalid("The team fund is the team's own money: it has nothing to set");

    const merged: SponsorInput = {
      name: input.name ?? target.name,
      type: input.type ?? target.type,
      vatRate: input.vatRate !== undefined ? input.vatRate : target.vatRate === null ? null : Number(target.vatRate),
      group: input.group !== undefined ? input.group : target.groupName,
    };
    const rate = await checkedRate(merged);
    if (merged.type !== "fund" && (await moneyOf(tx, [fundId])).has(fundId)) {
      throw invalid("Take the money of this sponsor away first: a sponsor that gives goods has no contract");
    }
    const [twin] = await tx
      .select({ id: fund.id })
      .from(fund)
      .where(and(eq(fund.seasonId, target.seasonId), sql`lower(${fund.name}) = lower(${merged.name})`));
    if (twin && twin.id !== fundId) throw conflict(`"${merged.name}" already exists`);

    const [updated] = await tx.update(fund).set(sponsorValues(merged, rate)).where(eq(fund.id, fundId)).returning();
    // a sponsor that gives goods is also a supplier of the same name, and follows it when it is renamed
    if (target.type !== "fund" && target.name !== merged.name) await renameSupplier(tx, target.name, merged.name);
    if (merged.type !== "fund") await ensureSupplier(tx, merged.name);
    return fundOut(updated!, (await moneyOf(tx, [fundId])).get(fundId));
  });
}

/** Deletes a sponsor with its money, if no budget line is paid from it. The team fund stays. */
export async function deleteFund(fundId: number) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(fund).where(eq(fund.id, fundId));
    if (!target) throw notFound("Fund");
    if (target.kind === "team") throw invalid("The team fund cannot be deleted");

    const [lines] = await tx.select({ n: sql<number>`count(*)::int` }).from(lineFund).where(eq(lineFund.fundId, fundId));
    if ((lines?.n ?? 0) > 0) throw conflict(`This fund pays ${lines?.n} budget lines`);
    await tx.delete(fundContract).where(eq(fundContract.fundId, fundId));
    await tx.delete(fund).where(eq(fund.id, fundId));
  });
}

// --- the money of a sponsor: one value and one date per phase ---------------------------------

/** Sets how much a sponsor is worth in a phase and when it arrives; replaces what was there. */
export async function setContract(fundId: number, phase: Phase, input: { amount: string; inflowDate: string | null }) {
  const actor = await assertCanManageShared();
  return runWrite(actor, async (tx) => {
    const [owner] = await tx.select().from(fund).where(eq(fund.id, fundId));
    if (!owner) throw notFound("Fund");
    if (owner.kind === "team") throw invalid("The team fund has no contracts: it is the team's own money");
    if (owner.type !== "fund") throw invalid(`"${owner.name}" gives goods, not a sum of money: it has no contract`);
    // one atomic write: two people setting the same money at once cannot leave two contracts
    const [saved] = await tx
      .insert(fundContract)
      .values({ fundId, phase, amount: input.amount, inflowDate: input.inflowDate })
      .onConflictDoUpdate({ target: [fundContract.fundId, fundContract.phase], set: { amount: input.amount, inflowDate: input.inflowDate } })
      .returning();
    return saved!;
  });
}

/** Takes the money of a sponsor in a phase away. */
export async function clearContract(fundId: number, phase: Phase) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const deleted = await tx
      .delete(fundContract)
      .where(and(eq(fundContract.fundId, fundId), eq(fundContract.phase, phase)))
      .returning({ id: fundContract.id });
    if (deleted.length === 0) throw notFound("Contract");
  });
}
