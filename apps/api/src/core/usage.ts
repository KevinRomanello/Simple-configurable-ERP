import { count, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./contracts";

/** How many rows of `table` hold each of `values` in `column`, in one query: the values nobody uses are not in the answer. */
export async function countRows(db: Db, table: PgTable, column: PgColumn, values: (string | number)[]): Promise<Map<string, number>> {
  if (values.length === 0) return new Map();
  const rows = await db.select({ value: column, n: count() }).from(table).where(inArray(column, values)).groupBy(column);
  return new Map(rows.map((r) => [String(r.value), r.n]));
}

/** The answer to «who uses these?» for the entries whose name has a count: `count` of `label` for each. */
export const rowsOf = (counts: Map<string, number>, subjects: { key: string; name: string }[], label: string) =>
  subjects.flatMap((s) => (counts.has(s.name) ? [{ key: s.key, label, count: counts.get(s.name)! }] : []));
