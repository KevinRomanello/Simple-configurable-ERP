import { sql } from "drizzle-orm";
import { db } from "../../db/client";

export interface Health {
  ok: boolean;
  db: boolean;
}

/** Reports whether the API is up and the database answers a trivial query. */
export async function getHealth(): Promise<Health> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true, db: true };
  } catch {
    return { ok: false, db: false };
  }
}
