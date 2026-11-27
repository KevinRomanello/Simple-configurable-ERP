import { and, desc, eq, lt, ne, notLike } from "drizzle-orm";
import { ALL_ACTIVE, contracts } from "../../core/contracts";
import { forbidden } from "../../core/errors";
import { db } from "../../db/client";
import { appUser, auditLog } from "../../db/schema/platform";
import { canViewHistory, getCurrentUser } from "../auth/auth.service";
import { auditLabels, auditText, type AuditRow } from "../platform.public";
import "./audit.labels";

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface HistoryEntry {
  id: number;
  at: string;
  /** Null for changes not made by a signed-in person (the seed, the importer). */
  actor: { id: number; email: string; name: string } | null;
  table: string;
  rowId: number;
  action: "insert" | "update" | "delete";
  /** A readable name for the row: the item, the project, the fund... */
  label: string;
  changes: FieldChange[];
}

type Json = Record<string, unknown> | null;

/** Fields that change on every edit and say nothing about what was edited. */
const NOISE = new Set(["version"]);

function changesOf(before: Json, after: Json): FieldChange[] {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const was = before?.[field] ?? null;
    const now = after?.[field] ?? null;
    if (JSON.stringify(was) !== JSON.stringify(now)) changes.push({ field, before: was, after: now });
  }
  // A pure version bump is not worth a line; keep it only if it is all there is.
  const meaningful = changes.filter((c) => !NOISE.has(c.field));
  return meaningful.length > 0 ? meaningful : changes;
}

/** The name of a row: each owner says it for its tables (`auditLabels`); a table nobody names is named by its `name`. */
function labelOf(labels: Record<string, (row: AuditRow) => string>, table: string, row: Json): string {
  if (!row) return "";
  return (labels[table] ?? ((r: AuditRow) => auditText(r, "name")))(row);
}

export interface HistoryQuery {
  table?: string;
  rowId?: number;
  actorId?: number;
  /** Return entries older than this id (to read the next page). */
  before?: number;
  limit: number;
}

/** The most recent changes first (admins and project managers). */
export async function listHistory(query: HistoryQuery): Promise<{ entries: HistoryEntry[]; next: number | null }> {
  const user = await getCurrentUser();
  if (!(await canViewHistory(user))) throw forbidden("You cannot read the history");

  const conditions = [
    query.table ? eq(auditLog.tableName, query.table) : undefined,
    query.rowId !== undefined ? eq(auditLog.rowId, query.rowId) : undefined,
    query.actorId !== undefined ? eq(auditLog.actorId, query.actorId) : undefined,
    query.before !== undefined ? lt(auditLog.id, query.before) : undefined,
    // the registry has rules per field (docs/anagrafiche.md, §7): its raw history is for the admins; the others
    // read the history of a record from the registry, which shows only the fields they may see
    user.role === "admin" ? undefined : and(notLike(auditLog.tableName, "reg\\_%"), ne(auditLog.tableName, "api_token"), ne(auditLog.tableName, "role_sync")),
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({ entry: auditLog, actor: { id: appUser.id, email: appUser.email, name: appUser.name } })
    .from(auditLog)
    .leftJoin(appUser, eq(auditLog.actorId, appUser.id))
    .where(and(...conditions))
    .orderBy(desc(auditLog.id))
    .limit(query.limit + 1);

  // every owner's names, even a module that is off: a row of the History is named the same whatever is on
  const labels: Record<string, (row: AuditRow) => string> = Object.assign({}, ...contracts.declared(auditLabels, ALL_ACTIVE));
  const page = rows.slice(0, query.limit);
  return {
    entries: page.map(({ entry, actor }) => ({
      id: entry.id,
      at: entry.at.toISOString(),
      actor: actor?.id ? actor : null,
      table: entry.tableName,
      rowId: entry.rowId,
      action: entry.action as HistoryEntry["action"],
      label: labelOf(labels, entry.tableName, (entry.after ?? entry.before) as Json),
      changes: changesOf(entry.before as Json, entry.after as Json),
    })),
    next: rows.length > query.limit ? page.at(-1)!.entry.id : null,
  };
}
