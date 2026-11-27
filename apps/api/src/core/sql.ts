import { sql, type AnyColumn } from "drizzle-orm";

/**
 * `column = any(ids)` with all the ids as ONE parameter. `inArray` makes one parameter for each id, and a list of thousands of lines (the labels
 * of the lines a register has paid) is several times slower for the database to prepare than the same list as one array.
 */
export const anyOf = (column: AnyColumn, ids: number[]) => sql`${column} = any(${sql.param(ids)}::int[])`;
