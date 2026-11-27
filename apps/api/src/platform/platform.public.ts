import { ALL_ACTIVE, contracts, defineDeclaration, defineEvent, defineQuestion, type Active, type Db } from "../core/contracts";
import type { Role } from "./auth/auth.service";

// What the core asks the modules and tells them (docs/moduli-architettura.md, §5): the modules answer and listen from their own
// `*.contract.ts`, and the core never reads their tables. This is the only file of `platform/` the modules import for it.

/**
 * Who is on for the request being served. The modules and the bridges that are turned off do not answer a question that is a feature and
 * do not hear an event that is one (the ones that keep the data in order reach everybody).
 */
export function currentActive(): Active {
  // HARDCODED: who is on, read from the switches of the modules (the last step of the plan of docs/moduli-architettura.md, §8)
  return ALL_ACTIVE;
}

// --- who uses a thing of a common list ------------------------------------------------------------

/** The common lists whose entries other modules write by name or point at (the category of a line or of an item, a VAT rate, a season). */
export type UsageKind = "category" | "vatRate" | "season";

/** One entry of a list. `key` is how the answer names it; `name` is what the rows that use it hold (the name, the rate). */
export interface UsageSubject {
  key: string;
  name: string;
  id?: number;
}

/** What uses the entry `key`: `count` of `label` ("12 budget lines"). */
export interface UsageRow {
  key: string;
  label: string;
  count: number;
}

/** «Who uses these?»: every module that is on answers with what of it uses the entries. */
export const usedBy = defineQuestion<{ kind: UsageKind; subjects: UsageSubject[] }, UsageRow[]>("usedBy", "feature");

/** What uses each of `subjects`, by key: the labels with their counts, in the order of the modules; an entry nobody uses is not there. */
export async function usageOf(db: Db, kind: UsageKind, subjects: UsageSubject[]): Promise<Map<string, UsageRow[]>> {
  const answers = (await contracts.collect(usedBy, currentActive(), db, { kind, subjects })).flat();
  const byKey = new Map<string, UsageRow[]>();
  for (const row of answers.filter((r) => r.count > 0)) {
    const rows = byKey.get(row.key) ?? [];
    const same = rows.find((r) => r.label === row.label);
    if (same) same.count += row.count;
    else rows.push({ ...row });
    byKey.set(row.key, rows);
  }
  return byKey;
}

/** How many things use an entry, all labels together (the USED BY column of Settings). */
export const totalUse = (rows: UsageRow[] | undefined) => (rows ?? []).reduce((sum, r) => sum + r.count, 0);

// --- what happens to the data of the modules when the core changes ---------------------------------

/** A category was renamed: every module that writes it by name changes its rows, whether it is on or off. */
export const lookupRenamed = defineEvent<{ kind: "category"; from: string; to: string }>("lookupRenamed", "data");

/** A category was created in Settings: the owners that keep something for each category start it (the fields an item of it shows). */
export const categoryCreated = defineEvent<{ categoryId: number }>("categoryCreated", "data");

/** A season was added (`fromSeasonId`: the latest before it, if there is one): every module prepares its part of it, whether it is on or off. */
export const seasonCreated = defineEvent<{ seasonId: number; fromSeasonId: number | null }>("seasonCreated", "data");

// --- how the History names a row -----------------------------------------------------------------

/** What a row of the History looks like: its columns as the trigger wrote them. */
export type AuditRow = Record<string, unknown>;

/** The text of a column of a row of the History, or nothing. */
export const auditText = (row: AuditRow, key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");

/** Each owner says how to name the rows of its tables in the History: a function per table. */
export const auditLabels = defineDeclaration<Record<string, (row: AuditRow) => string>>("auditLabels");

// --- the boxes of a person ----------------------------------------------------------------------

/** A box of a person that a module offers (Treasury, Sponsors): what the Users page calls it and who may have it. */
export interface UserFlag {
  key: string;
  label: string;
  explanation: string;
  /** The roles that may have it: a box is cleared when the person is made something else. */
  roles: Role[];
}

/** Each module declares its boxes at the start; the core keeps who has them (`user_flag`) and does not know what they are for. */
export const userFlags = defineDeclaration<UserFlag>("userFlags");

/** The boxes of the modules that are on, in the order the modules were read. */
export const declaredFlags = (): UserFlag[] => contracts.declared(userFlags, currentActive());

// --- what a person may do ------------------------------------------------------------------------

/** A rule of a permission, as the module that knows it writes it: the person's role and boxes in, yes or no out. */
export interface PermissionRule {
  /** The name of the permission (`canManageCash`): the interface is told it in GET /api/me. */
  key: string;
  rule: (user: { role: Role; flags: string[] }) => boolean;
}

/** Each module (or bridge) declares the rules of the permissions it knows: the treasury says who keeps the money, the bridge who may change the inflows. */
export const permissionRules = defineDeclaration<PermissionRule>("permissionRules");

/** Whether any rule declared for `key` by the modules that are on says yes: a bridge can widen what a module allows. */
export function can(user: { role: Role; flags: string[] }, key: string): boolean {
  return contracts.declared(permissionRules, currentActive()).some((p) => p.key === key && p.rule(user));
}
