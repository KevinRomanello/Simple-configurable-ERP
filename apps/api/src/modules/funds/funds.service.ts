import type { Phase } from "@erp/calc";
import { and, asc, eq, exists, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { fund, fundContract, lineFigures } from "../../db/schema";
import { canWrite, getCurrentUser } from "../auth/auth.service";
import { getCurrentSeason } from "../seasons/seasons.service";

async function assertCanManageShared() {
  const actor = await getCurrentUser();
  if (!(await canWrite(actor, null))) throw forbidden("You cannot change funds");
  return actor;
}

/**
 * The funds a line can be paid from in a phase: the team fund plus every external fund that has
 * a contract in that phase (GET /api/funds?phase=). Without a phase, every fund.
 */
export async function listFunds(phase?: Phase) {
  const season = await getCurrentSeason();
  const inSeason = eq(fund.seasonId, season.id);
  const hasContract = (p: Phase) =>
    exists(
      db.select({ one: sql`1` }).from(fundContract).where(and(eq(fundContract.fundId, fund.id), eq(fundContract.phase, p))),
    );
  return db
    .select()
    .from(fund)
    .where(phase ? and(inSeason, sql`(${fund.kind} = 'team' or ${hasContract(phase)})`) : inSeason)
    .orderBy(sql`${fund.kind} = 'team' desc`, sql`lower(${fund.name})`);
}

/** Sets the "DOES IT PAY VAT?" boxes of a fund. */
export async function updateFund(fundId: number, input: { paysVatEstimate?: boolean; paysVatActual?: boolean }) {
  const actor = await assertCanManageShared();
  return runWrite(actor, async (tx) => {
    const [updated] = await tx.update(fund).set(input).where(eq(fund.id, fundId)).returning();
    if (!updated) throw notFound("Fund");
    return updated;
  });
}

/** Deletes a fund nobody uses. The team fund and funds with contracts or lines stay. */
export async function deleteFund(fundId: number) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(fund).where(eq(fund.id, fundId));
    if (!target) throw notFound("Fund");
    if (target.kind === "team") throw invalid("The team fund cannot be deleted");

    const [contracts] = await tx.select({ n: sql<number>`count(*)::int` }).from(fundContract).where(eq(fundContract.fundId, fundId));
    if ((contracts?.n ?? 0) > 0) throw conflict("Delete the contracts of this fund first");
    const [lines] = await tx.select({ n: sql<number>`count(*)::int` }).from(lineFigures).where(eq(lineFigures.fundId, fundId));
    if ((lines?.n ?? 0) > 0) throw conflict(`This fund pays ${lines?.n} budget lines`);
    await tx.delete(fund).where(eq(fund.id, fundId));
  });
}

// --- contracts: the CASH FROM tables -----------------------------------------------------------

/** The contracts of a phase, ordered like the old sheet (name, then date). */
export async function listContracts(phase: Phase) {
  const rows = await db
    .select({
      id: fundContract.id,
      fundId: fundContract.fundId,
      fundName: fund.name,
      amount: fundContract.amount,
      inflowDate: fundContract.inflowDate,
    })
    .from(fundContract)
    .innerJoin(fund, eq(fundContract.fundId, fund.id))
    .where(eq(fundContract.phase, phase))
    .orderBy(asc(sql`lower(${fund.name})`), asc(fundContract.inflowDate));
  return rows;
}

async function fundNamed(tx: Tx, seasonId: number, name: string) {
  const [existing] = await tx
    .select()
    .from(fund)
    .where(and(eq(fund.seasonId, seasonId), sql`lower(${fund.name}) = lower(${name})`));
  if (existing) {
    if (existing.kind === "team") throw invalid("The team fund has no contracts: it is the team's own money");
    return existing;
  }
  const [created] = await tx.insert(fund).values({ seasonId, name, kind: "external" }).returning();
  return created!;
}

/** Adds a contract; the fund is created on the first contract of a new name ("INSERT COMPANY"). */
export async function createContract(input: { phase: Phase; fundName: string; amount: string; inflowDate?: string | null }) {
  const actor = await assertCanManageShared();
  const season = await getCurrentSeason();
  return runWrite(actor, async (tx) => {
    const owner = await fundNamed(tx, season.id, input.fundName);
    const [created] = await tx
      .insert(fundContract)
      .values({ fundId: owner.id, phase: input.phase, amount: input.amount, inflowDate: input.inflowDate ?? null })
      .returning();
    return created!;
  });
}

export async function deleteContract(contractId: number) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const deleted = await tx.delete(fundContract).where(eq(fundContract.id, contractId)).returning({ id: fundContract.id });
    if (deleted.length === 0) throw notFound("Contract");
  });
}

