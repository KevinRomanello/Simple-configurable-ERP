import { eq } from "drizzle-orm";
import { conflict, invalid, notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { inflowReceipt } from "../../db/schema/treasury-budget";
import { assertSeasonOpen, getCurrentSeason } from "../../platform/seasons/seasons.service";
import { inflowsByIds } from "../../modules/budget/budget.public";
import { assertCanManageCash, entriesByIds, insertEntry, moneyInBetween } from "../../modules/treasury/treasury.public";
import type { ReceiveInput } from "./treasury-budget.schema";

// «Mark as received» (docs/registro-di-cassa.md, section 5.2): an expected inflow of CASH FLOW arrives as a movement of the register.
// Receiving it, and taking that back, are the treasury's: it is the treasury's money that the inflow becomes.

/** The movements of money in that are not tied to an inflow yet, newest first: what "Mark as received" can link to. */
export async function listReceivable() {
  await assertCanManageCash();
  const season = await getCurrentSeason();
  const received = new Set((await db.select({ entryId: inflowReceipt.entryId }).from(inflowReceipt)).map((r) => r.entryId));
  return (await moneyInBetween(db, { from: season.startsOn, to: season.endsOn }))
    .filter((e) => !received.has(e.id))
    .slice(0, 300)
    .map((e) => ({ id: e.id, on: e.on, description: e.description, account: e.account, amount: e.amount, sponsorship: e.sponsorship }));
}

/** An expected inflow has arrived: ties it to a movement of the register, made now or already there. */
export async function receiveInflow(inflowId: number, input: ReceiveInput) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    const [inflow] = await inflowsByIds(tx, [inflowId], true);
    if (!inflow) throw notFound("Inflow");
    await assertSeasonOpen(tx, inflow.seasonId);
    if (inflow.phase !== "estimate") throw invalid("Only an expected inflow can be marked as received");
    const [received] = await tx.select({ id: inflowReceipt.id }).from(inflowReceipt).where(eq(inflowReceipt.inflowId, inflowId));
    if (received) throw conflict("This inflow is already received: mark it as not received first");

    let entryId: number;
    if ("entryId" in input) {
      const [entry] = await entriesByIds(tx, [input.entryId]);
      if (!entry) throw notFound("Movement");
      if (entry.cents <= 0) throw invalid("Only money in can receive an inflow");
      const [taken] = await tx.select({ id: inflowReceipt.id }).from(inflowReceipt).where(eq(inflowReceipt.entryId, entry.id));
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
    await tx.insert(inflowReceipt).values({ inflowId, entryId });
  });
}

/** Takes the link back: the inflow is expected again, the movement stays in the register. */
export async function unreceiveInflow(inflowId: number) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    const [inflow] = await inflowsByIds(tx, [inflowId], true);
    if (!inflow) throw notFound("Inflow");
    await assertSeasonOpen(tx, inflow.seasonId);
    await tx.delete(inflowReceipt).where(eq(inflowReceipt.inflowId, inflowId));
  });
}
