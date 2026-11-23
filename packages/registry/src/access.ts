import type { Registry } from "./compute";
import { matches } from "./filter";
import { isComputed, type AccessLevel, type AccessRule, type RecordRow, type Table } from "./types";

// Who may see and change what (docs/anagrafiche.md, §7): rules per table, for everybody who signs in, for a
// group (a view of the people table) or for the records tied to the person looking. The admins of the ERP
// always manage everything.

/** The person looking, as the registry knows them. `userId` null: nobody signed in (a public form). */
export interface Viewer {
  userId: number | null;
  email: string | null;
  isAdmin: boolean;
  /** Their record in the people table, if there is one. */
  personId: number | null;
  /** The groups they are in (ids of views of the people table). */
  groups: number[];
}

export interface Permission {
  level: AccessLevel | null;
  /** The fields they see. */
  visible: Set<number>;
  /** The fields they may change (never the worked-out ones). */
  writable: Set<number>;
}

const RANK: Record<AccessLevel, number> = { read: 1, edit: 2, manage: 3 };

export const atLeast = (level: AccessLevel | null, wanted: AccessLevel) => level !== null && RANK[level] >= RANK[wanted];

/** The record of the person who signs in with `email`: found by the email field of the people table. */
export function personOf(reg: Registry, email: string | null): number | null {
  const { peopleTableId, emailFieldId } = reg.snapshot.settings;
  if (!email || peopleTableId === null || emailFieldId === null) return null;
  const field = reg.field(emailFieldId);
  if (!field || field.tableId !== peopleTableId) return null;
  const wanted = email.trim().toLowerCase();
  const found = reg.recordsOf(peopleTableId).find((r) => String(reg.value(r, field) ?? "").trim().toLowerCase() === wanted);
  return found?.id ?? null;
}

/** The views of the people table that are groups. */
export function groupViews(reg: Registry) {
  const { peopleTableId } = reg.snapshot.settings;
  return peopleTableId === null ? [] : reg.viewsOf(peopleTableId).filter((v) => v.config.group === true && v.type === "grid");
}

/** The groups a person is in: the group views their record matches. */
export function groupsOf(reg: Registry, personId: number | null): number[] {
  const person = personId === null ? undefined : reg.record(personId);
  if (!person) return [];
  const env = { today: reg.snapshot.today, peopleTableId: reg.snapshot.settings.peopleTableId, me: { email: null, personId } };
  return groupViews(reg).filter((v) => matches(reg, person, v.config.filter, env)).map((v) => v.id);
}

/** The person signed in with `email`, with their record and groups. */
export function viewerFor(reg: Registry, user: { id: number; email: string; isAdmin: boolean } | null): Viewer {
  if (!user) return { userId: null, email: null, isAdmin: false, personId: null, groups: [] };
  const personId = personOf(reg, user.email);
  return { userId: user.id, email: user.email.toLowerCase(), isAdmin: user.isAdmin, personId, groups: groupsOf(reg, personId) };
}

function appliesEverywhere(rule: AccessRule, viewer: Viewer): boolean {
  if (rule.who.kind === "everyone") return viewer.userId !== null;
  if (rule.who.kind === "group") return viewer.groups.includes(rule.who.groupId);
  return false;
}

function appliesTo(reg: Registry, table: Table, rule: AccessRule, viewer: Viewer, record: RecordRow): boolean {
  if (rule.who.kind !== "self") return appliesEverywhere(rule, viewer);
  if (viewer.personId === null) return false;
  if (rule.who.linkFieldId === undefined) return table.id === reg.snapshot.settings.peopleTableId && record.id === viewer.personId;
  const link = reg.field(rule.who.linkFieldId);
  return link !== undefined && link.type === "link" && reg.linkedIds(record, link).includes(viewer.personId);
}

function combine(reg: Registry, table: Table, rules: AccessRule[], viewer: Viewer): Permission {
  const all = reg.fieldsOf(table.id);
  if (viewer.isAdmin) {
    return { level: "manage", visible: new Set(all.map((f) => f.id)), writable: new Set(all.filter((f) => !isComputed(f.type)).map((f) => f.id)) };
  }
  let level: AccessLevel | null = null;
  const visible = new Set<number>();
  const writable = new Set<number>();
  for (const rule of rules) {
    // a rule on one's own records cannot manage the whole table
    const ruleLevel: AccessLevel = rule.who.kind === "self" && rule.level === "manage" ? "edit" : rule.level;
    if (level === null || RANK[ruleLevel] > RANK[level]) level = ruleLevel;
    const hidden = new Set(rule.hidden ?? []);
    const readOnly = new Set(rule.readOnly ?? []);
    for (const f of all) {
      if (hidden.has(f.id)) continue;
      visible.add(f.id);
      if (atLeast(ruleLevel, "edit") && !readOnly.has(f.id) && !isComputed(f.type)) writable.add(f.id);
    }
  }
  return { level, visible, writable };
}

/** What the rules that hold for the whole table give: what is listed and what can be added. */
export function tablePermission(reg: Registry, table: Table, viewer: Viewer): Permission {
  return combine(reg, table, table.access.filter((r) => appliesEverywhere(r, viewer)), viewer);
}

/** What holds for one record: the rules of the whole table, and the ones on one's own records that match. */
export function recordPermission(reg: Registry, table: Table, record: RecordRow, viewer: Viewer): Permission {
  return combine(reg, table, table.access.filter((r) => appliesTo(reg, table, r, viewer, record)), viewer);
}

/** Whether somebody can see at least some of the records of a table (to list it in the menu). */
export function canSeeTable(reg: Registry, table: Table, viewer: Viewer): boolean {
  return viewer.isAdmin || table.access.some((r) => (r.who.kind === "self" ? viewer.personId !== null : appliesEverywhere(r, viewer)));
}
