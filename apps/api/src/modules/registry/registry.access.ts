import { atLeast, canSeeTable, isFilter, recordPermission, tablePermission, viewerFor, type AccessLevel, type Condition, type Field, type Filter, type Permission, type RecordRow, type Registry, type Table, type Viewer } from "@erp/registry";
import { eq, sql } from "drizzle-orm";
import { forbidden, invalid, notFound } from "../../core/errors";
import { db } from "../../db/client";
import { regTable } from "../../db/schema/registry";
import { userStorage } from "../../platform/auth/auth.context";
import type { User } from "../../platform/auth/auth.service";

// Who is looking and what they may do, for the services of the registry. The rules themselves are in the
// engine (packages/registry/src/access.ts); here they meet the signed-in user of the request.

/** The user of the request, or null (a public form: nobody signed in). */
export function signedInUser(): User | null {
  return userStorage.getStore() ?? null;
}

export function viewerOf(reg: Registry, user: User | null = signedInUser()): Viewer {
  return viewerFor(reg, user ? { id: user.id, email: user.email, isAdmin: user.role === "admin" } : null);
}

/** The id of a table named by id or by name; 404 if there is none. */
export async function tableIdOf(ref: string | number): Promise<number> {
  const text = String(ref).trim();
  const [row] = /^\d+$/.test(text)
    ? await db.select({ id: regTable.id }).from(regTable).where(eq(regTable.id, Number(text)))
    : await db.select({ id: regTable.id }).from(regTable).where(sql`lower(${regTable.name}) = ${text.toLowerCase()}`);
  if (!row) throw notFound("Table");
  return row.id;
}

export function tableOf(reg: Registry, tableId: number): Table {
  const table = reg.table(tableId);
  if (!table) throw notFound("Table");
  return table;
}

/** What the viewer may do on the table as a whole; refuses below `level` (a table they cannot see at all is a 403 too). */
export function needTable(reg: Registry, table: Table, viewer: Viewer, level: AccessLevel): Permission {
  const permission = tablePermission(reg, table, viewer);
  if (!atLeast(permission.level, level)) {
    if (!canSeeTable(reg, table, viewer)) throw forbidden("You cannot see this table");
    throw forbidden(level === "manage" ? "Only who manages this table can change it" : "You cannot change the records of this table");
  }
  return permission;
}

/** What the viewer may do on one record; refuses below `level`. */
export function needRecord(reg: Registry, table: Table, record: RecordRow, viewer: Viewer, level: AccessLevel): Permission {
  const permission = recordPermission(reg, table, record, viewer);
  if (!atLeast(permission.level, level)) throw level === "read" ? notFound("Record") : forbidden("You cannot change this record");
  return permission;
}

/** The records the viewer may see: all of them with a rule on the whole table, else the ones of their own rules. */
export function visibleRecords(reg: Registry, table: Table, viewer: Viewer): RecordRow[] {
  const all = reg.recordsOf(table.id);
  if (atLeast(tablePermission(reg, table, viewer).level, "read")) return all;
  return all.filter((r) => atLeast(recordPermission(reg, table, r, viewer).level, "read"));
}

/** The fields the viewer sees on the table as a whole (and, through their own rules, on some records). */
export function visibleFields(reg: Registry, table: Table, viewer: Viewer): Field[] {
  const whole = tablePermission(reg, table, viewer).visible;
  const extra = new Set<number>();
  if (table.access.some((r) => r.who.kind === "self")) {
    for (const r of visibleRecords(reg, table, viewer)) for (const id of recordPermission(reg, table, r, viewer).visible) extra.add(id);
  }
  return reg.fieldsOf(table.id).filter((f) => whole.has(f.id) || extra.has(f.id));
}

/** A field of the table named by id or by name; 400 if there is none. */
export function fieldOf(reg: Registry, table: Table, ref: string | number): Field {
  const field = reg.findField(table.id, ref);
  if (!field) throw invalid(`There is no field "${ref}" in ${table.name}`);
  return field;
}

/** A filter sent by a client, with its fields named by name or id, turned into ids; only fields it may see. */
export function filterFrom(reg: Registry, table: Table, input: unknown, allowed: Set<number> | null): Filter {
  const walk = (node: { join: "and" | "or"; items: unknown[]; not?: boolean }): Filter => ({
    join: node.join,
    ...(node.not ? { not: true } : {}),
    items: node.items.map((item) => {
      const it = item as Condition | Filter | { field: string | number; op: Condition["op"]; value?: unknown };
      if (isFilter(it as Condition | Filter)) return walk(it as Filter);
      const c = it as { field: string | number; op: Condition["op"]; value?: unknown };
      const field = fieldOf(reg, table, c.field);
      if (allowed && !allowed.has(field.id)) throw invalid(`There is no field "${c.field}" in ${table.name}`);
      return c.value === undefined ? { field: field.id, op: c.op } : { field: field.id, op: c.op, value: c.value };
    }),
  });
  return walk(input as { join: "and" | "or"; items: unknown[] });
}
