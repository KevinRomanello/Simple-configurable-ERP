import { and, desc, eq, lt } from "drizzle-orm";
import { forbidden } from "../../core/errors";
import { db } from "../../db/client";
import { appUser, auditLog } from "../../db/schema";
import { canViewHistory, getCurrentUser } from "../auth/auth.service";

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

function labelOf(table: string, row: Json): string {
  if (!row) return "";
  const pick = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  switch (table) {
    case "budget_line":
      return pick("item");
    case "line_figures":
      return `figures (${pick("phase")}) of line ${String(row.line_id ?? "")}`;
    case "fund_contract":
      return `contract of fund ${String(row.fund_id ?? "")}`;
    case "line_fund":
      return `fund ${String(row.fund_id ?? "")} (no. ${String(row.position ?? "")}) of figures ${String(row.figures_id ?? "")}`;
    case "team_inflow":
      return pick("source_name");
    case "app_user":
      return pick("email");
    case "user_area":
      return `user ${String(row.user_id ?? "")}, area ${String(row.area_id ?? "")}`;
    case "bank_snapshot":
      return "BANK";
    case "inventory_item":
      return pick("name");
    case "stock_movement":
      return `${pick("kind")} of item ${String(row.item_id ?? "")}`;
    case "component_part":
      return `part ${String(row.part_id ?? "")} of item ${String(row.component_id ?? "")}`;
    default:
      return pick("name");
  }
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
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({ entry: auditLog, actor: { id: appUser.id, email: appUser.email, name: appUser.name } })
    .from(auditLog)
    .leftJoin(appUser, eq(auditLog.actorId, appUser.id))
    .where(and(...conditions))
    .orderBy(desc(auditLog.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  return {
    entries: page.map(({ entry, actor }) => ({
      id: entry.id,
      at: entry.at.toISOString(),
      actor: actor?.id ? actor : null,
      table: entry.tableName,
      rowId: entry.rowId,
      action: entry.action as HistoryEntry["action"],
      label: labelOf(entry.tableName, (entry.after ?? entry.before) as Json),
      changes: changesOf(entry.before as Json, entry.after as Json),
    })),
    next: rows.length > query.limit ? page.at(-1)!.entry.id : null,
  };
}
