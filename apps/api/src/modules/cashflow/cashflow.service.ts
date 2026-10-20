import type { Phase } from "@erp/calc";
import { asc, eq, sql } from "drizzle-orm";
import { forbidden, notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { bankSnapshot, teamInflow } from "../../db/schema";
import { canWrite, getCurrentUser } from "../auth/auth.service";
import { getCurrentSeason } from "../seasons/seasons.service";

async function assertCanManageShared() {
  const actor = await getCurrentUser();
  if (!(await canWrite(actor, null))) throw forbidden("You cannot change the cash flow");
  return actor;
}

/** CASH FLOW inflow tables of a phase, ordered like the old sheet (name, then date). */
export async function listInflows(phase: Phase) {
  const season = await getCurrentSeason();
  return db
    .select()
    .from(teamInflow)
    .where(sql`${teamInflow.seasonId} = ${season.id} and ${teamInflow.phase} = ${phase}`)
    .orderBy(asc(sql`lower(${teamInflow.sourceName})`), asc(teamInflow.inflowDate));
}

export async function createInflow(input: { phase: Phase; sourceName: string; amount: string; inflowDate?: string | null }) {
  const actor = await assertCanManageShared();
  const season = await getCurrentSeason();
  return runWrite(actor, async (tx) => {
    const [created] = await tx
      .insert(teamInflow)
      .values({ seasonId: season.id, ...input, inflowDate: input.inflowDate ?? null })
      .returning();
    return created!;
  });
}

export async function deleteInflow(inflowId: number) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const deleted = await tx.delete(teamInflow).where(eq(teamInflow.id, inflowId)).returning({ id: teamInflow.id });
    if (deleted.length === 0) throw notFound("Inflow");
  });
}

/** The BANK box: one balance at one date, or null when none was entered. */
export async function getBank() {
  const season = await getCurrentSeason();
  const [bank] = await db.select().from(bankSnapshot).where(eq(bankSnapshot.seasonId, season.id));
  return bank ?? null;
}

/** Sets the BANK balance (and the date it refers to, if known). */
export async function setBank(input: { amount: string; asOfDate?: string | null }) {
  const actor = await assertCanManageShared();
  const season = await getCurrentSeason();
  return runWrite(actor, async (tx) => {
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
  await runWrite(actor, (tx) => tx.delete(bankSnapshot).where(eq(bankSnapshot.seasonId, season.id)));
}
