import { db } from "../db/client";
import type { User } from "../modules/auth/auth.service";

/** The transaction handle passed to write functions. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The single entry point for every write: one transaction per request.
 * Later this is where the audit log row and the recalculated calc_* tables are written,
 * inside the same transaction, so no write can skip them.
 */
export async function runWrite<T>(actor: User, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await fn(tx);
    // Future: audit_log(actor, ...) and calc_* refresh go here.
    return result;
  });
}
