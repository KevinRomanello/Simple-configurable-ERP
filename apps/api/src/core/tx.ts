import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { User } from "../modules/auth/auth.service";

/** The transaction handle passed to write functions. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The single entry point for every write: one transaction per request.
 *
 * It tells the database who is writing (the audit trigger reads it), so every change is recorded
 * in the history in the same transaction. Later this is also where the calc_* tables can be
 * refreshed.
 */
export async function runWrite<T>(actor: User, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // `true` = valid for this transaction only
    await tx.execute(sql`select set_config('app.actor_id', ${String(actor.id)}, true)`);
    return fn(tx);
  });
}
