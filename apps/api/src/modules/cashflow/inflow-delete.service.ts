import { eq, inArray } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { cashEntry, cashEntryLine, teamInflow } from "../../db/schema";
import { canManageCash } from "../../platform/auth/auth.service";
import { deleteEntryIn } from "../cash/cash.service";
import { assertSeasonOpen, getCurrentSeason } from "../../platform/seasons/seasons.service";
import { assertCanChangeInflows, bankOf } from "./cashflow.service";

// Deleting an inflow of CASH FLOW choosing where from (docs/registro-di-cassa.md, section 5.2): the same company is often in three
// places, the inflow that was expected, the one that arrived and the movement of the register that received it, and they are
// deleted together, or one by one, in one go.

/** One thing that can be deleted: an inflow (expected or actual) or a movement of the register. */
export interface RelatedVoice {
  kind: "inflow" | "entry";
  id: number;
  name: string;
  /** Decimal euros, as typed. */
  amount: string;
  date: string | null;
  /** An expected inflow that a movement of the register received. */
  received: boolean;
  receivedOn: string | null;
  /** False for an actual inflow typed by hand while the BANK comes from the register: the cash flow does not count it. */
  counted: boolean;
  /** The row the person pressed. */
  pressed: boolean;
  canDelete: boolean;
  /** Why it cannot be deleted, when it cannot. */
  why: string | null;
}

/** Companies are compared without capitals and without spaces at the ends, so that the instalments of one sponsor are together. */
const same = (name: string) => name.trim().toLowerCase();

/**
 * Everything of one company in the season, starting from the inflow or from the movement of the register that was pressed
 * (GET /api/inflows/related). Of the register only the movements tied to the expected inflows are there: its descriptions are free text.
 */
export async function listRelated(input: { inflowId?: number; cashEntryId?: number }) {
  const actor = await assertCanChangeInflows();
  const treasury = await canManageCash(actor);
  const season = await getCurrentSeason();
  const fromRegister = (await bankOf(db, season))?.source === "register";
  const closed = season.readOnly;

  const rows = await db.select({ inflow: teamInflow, entry: cashEntry }).from(teamInflow).leftJoin(cashEntry, eq(teamInflow.cashEntryId, cashEntry.id)).where(eq(teamInflow.seasonId, season.id));

  let company: string | null;
  let pressedEntry: number | null = null;
  if (input.inflowId !== undefined) {
    const pressed = rows.find((r) => r.inflow.id === input.inflowId);
    if (!pressed) throw notFound("Inflow");
    company = same(pressed.inflow.sourceName);
  } else {
    const [entry] = await db.select().from(cashEntry).where(eq(cashEntry.id, input.cashEntryId!));
    if (!entry) throw notFound("Movement");
    pressedEntry = entry.id;
    // the company is the one of the inflow that this movement received; a movement nobody received is alone
    const receiver = rows.find((r) => r.inflow.cashEntryId === entry.id);
    company = receiver ? same(receiver.inflow.sourceName) : null;
  }
  const siblings = company === null ? [] : rows.filter((r) => same(r.inflow.sourceName) === company);

  const inflowVoice = ({ inflow, entry }: (typeof rows)[number]): RelatedVoice => {
    const received = inflow.cashEntryId !== null;
    const why = closed ? `The season ${season.name} is read-only` : received && !treasury ? "Only the treasury can delete a received inflow" : null;
    return {
      kind: "inflow", id: inflow.id, name: inflow.sourceName, amount: inflow.amount, date: inflow.inflowDate, received, receivedOn: entry?.entryOn ?? null,
      counted: inflow.phase === "estimate" || !fromRegister, pressed: inflow.id === input.inflowId, canDelete: why === null, why,
    };
  };
  const expected = siblings.filter((r) => r.inflow.phase === "estimate").map(inflowVoice);
  const actual = siblings.filter((r) => r.inflow.phase === "actual").map(inflowVoice);

  // the movements tied to these inflows, and the one that was pressed
  const entryIds = [...new Set([...siblings.flatMap((r) => (r.inflow.cashEntryId === null ? [] : [r.inflow.cashEntryId])), ...(pressedEntry === null ? [] : [pressedEntry])])];
  let register: RelatedVoice[] = [];
  if (treasury && entryIds.length > 0) {
    const entries = await db.select().from(cashEntry).where(inArray(cashEntry.id, entryIds));
    const paying = await db.select({ entryId: cashEntryLine.entryId }).from(cashEntryLine).where(inArray(cashEntryLine.entryId, entryIds)).groupBy(cashEntryLine.entryId);
    register = entries.map((e): RelatedVoice => {
      const why = closed ? `The season ${season.name} is read-only` : paying.some((p) => p.entryId === e.id) ? "It pays budget lines: remove them in the register first" : null;
      return { kind: "entry", id: e.id, name: e.description, amount: e.amount, date: e.entryOn, received: false, receivedOn: null, counted: true, pressed: e.id === pressedEntry, canDelete: why === null, why };
    });
  }
  // whoever cannot see the register is told only that there are movements there, to explain why a received inflow stays
  return { expected, actual, register, registerHidden: treasury ? 0 : entryIds.length };
}

/**
 * Deletes inflows and movements of the register together (POST /api/inflows/delete): all or nothing. A movement that received an
 * inflow that stays makes it «not received» again (the key of the database does it).
 */
export async function deleteInflows(input: { inflowIds: number[]; cashEntryIds: number[] }) {
  const actor = await assertCanChangeInflows();
  const treasury = await canManageCash(actor);
  const season = await getCurrentSeason();
  const inflowIds = [...new Set(input.inflowIds)];
  const entryIds = [...new Set(input.cashEntryIds)];
  if (inflowIds.length + entryIds.length === 0) throw invalid("Choose what to delete");

  await runWrite(actor, async (tx) => {
    await assertSeasonOpen(tx, season.id);
    const inflows = inflowIds.length > 0 ? await tx.select().from(teamInflow).where(inArray(teamInflow.id, inflowIds)).for("update") : [];
    for (const id of inflowIds) {
      const found = inflows.find((i) => i.id === id);
      if (!found) throw notFound(`Inflow ${id}`);
      if (found.seasonId !== season.id) throw conflict(`"${found.sourceName}" belongs to another season`);
      // a received inflow is tied to the register: taking that apart is the treasury's, as marking it received was
      if (found.cashEntryId !== null && !treasury) throw forbidden(`"${found.sourceName}" is already received: only the treasury can delete it`);
    }
    if (entryIds.length > 0) {
      if (!treasury) throw forbidden("Only the treasury can delete a movement of the register");
      const entries = await tx.select().from(cashEntry).where(inArray(cashEntry.id, entryIds)).for("update");
      const paying = await tx.select({ entryId: cashEntryLine.entryId }).from(cashEntryLine).where(inArray(cashEntryLine.entryId, entryIds)).groupBy(cashEntryLine.entryId);
      for (const id of entryIds) {
        const found = entries.find((e) => e.id === id);
        if (!found) throw notFound(`Movement ${id}`);
        // this is the way to delete the money that came in: a payment is deleted in the register
        if (Number(found.amount) <= 0) throw conflict(`"${found.description}" is money out: delete it in the register`);
        if (paying.some((p) => p.entryId === id)) throw conflict(`"${found.description}" pays budget lines: remove them in the register first`);
      }
    }
    if (inflowIds.length > 0) await tx.delete(teamInflow).where(inArray(teamInflow.id, inflowIds));
    for (const id of entryIds) await deleteEntryIn(tx, id);
  });
}
