import { and, eq, inArray, sql } from "drizzle-orm";
import { invalid } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { appUser, area, roleSync, userArea } from "../../db/schema";
import { getCurrentUser, requireAdmin, type Role } from "../auth/auth.service";
import { groupsOfRegistry, onRegistryChange, onRegistryUse, peopleInViews } from "../registry/registry.public";
import { setManagedCheck } from "../users/users.service";

// The roles of the ERP taken from the registry (docs/anagrafiche.md, §9): who may enter, who is admin, who is a
// User ("pm") and of which areas, who has the Treasury and the Sponsors boxes, each from a group (a view of the
// people table) and the areas from a field. A module of its own: it uses the public functions of the registry
// and of the users, and neither of them knows it exists.

export interface RoleSyncConfig {
  enabled: boolean;
  activeViewId: number | null;
  adminViewId: number | null;
  pmViewId: number | null;
  pmAreasFieldId: number | null;
  treasuryViewId: number | null;
  sponsorsViewId: number | null;
}

/** One account as the registry wants it, and what would change. */
export interface RoleChange {
  email: string;
  name: string;
  /** No account yet: one is made. */
  create: boolean;
  changes: Record<string, { from: unknown; to: unknown }>;
}

let adminEmails: string[] = [];
let started = false;

/** Turns the link on for the life of the API: after every change of the registry, and for the Users page. */
export function startRoleSync(emails: string[]) {
  adminEmails = emails;
  if (started) return;
  started = true;
  onRegistryChange(async (tx) => {
    const config = await readConfig(tx);
    if (config.enabled) await apply(tx, config);
  });
  // the registry asks before a field or a group goes: the ones the roles are made from stay
  onRegistryUse(async ({ fieldIds, viewId }) => {
    const config = await readConfig(db);
    if (fieldIds?.some((id) => id === config.pmAreasFieldId)) return "the areas of the roles of the ERP (Settings › Access)";
    const views = [config.activeViewId, config.adminViewId, config.pmViewId, config.treasuryViewId, config.sponsorsViewId];
    if (viewId !== undefined && views.includes(viewId)) return "a role of the ERP (Settings › Access)";
    return null;
  });
  setManagedCheck(async (list) => {
    const config = await readConfig(db);
    if (!config.enabled) return new Set();
    const people = await peopleInViews(db, [], null);
    const known = new Set((people ?? []).map((p) => p.email));
    return new Set(list.filter((e) => known.has(e) && !adminEmails.includes(e)));
  });
}

async function readConfig(reader: Pick<typeof db, "select">): Promise<RoleSyncConfig> {
  const [row] = await reader.select().from(roleSync).where(eq(roleSync.id, 1));
  return {
    enabled: row?.enabled ?? false,
    activeViewId: row?.activeViewId ?? null,
    adminViewId: row?.adminViewId ?? null,
    pmViewId: row?.pmViewId ?? null,
    pmAreasFieldId: row?.pmAreasFieldId ?? null,
    treasuryViewId: row?.treasuryViewId ?? null,
    sponsorsViewId: row?.sponsorsViewId ?? null,
  };
}

/** What every account should be, compared with what it is. Nothing is written. */
async function plan(tx: Tx, config: RoleSyncConfig): Promise<{ changes: RoleChange[]; warnings: string[] }> {
  const views = [config.activeViewId, config.adminViewId, config.pmViewId, config.treasuryViewId, config.sponsorsViewId].filter((v): v is number => v !== null);
  const people = await peopleInViews(tx, views, config.pmAreasFieldId);
  if (!people) return { changes: [], warnings: ["The registry has no people table or no email field yet (Registry settings)"] };
  const areas = await tx.select({ id: area.id, code: area.code, name: area.name, derived: area.derived }).from(area);
  // an area is found by its code, its name, or a part of a code made of two (mt-dmt is MT and DMT)
  const areaByCode = new Map<string, number>();
  for (const a of areas.filter((x) => !x.derived)) {
    for (const key of [a.code, a.name, ...a.code.split("-")]) if (!areaByCode.has(key.toLowerCase())) areaByCode.set(key.toLowerCase(), a.id);
  }
  const users = await tx.select().from(appUser);
  const links = await tx.select().from(userArea);
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const warnings: string[] = [];
  const changes: RoleChange[] = [];
  const seen = new Set<string>();

  for (const person of people) {
    if (seen.has(person.email)) {
      warnings.push(`${person.email} is in the registry more than once: the first one counts`);
      continue;
    }
    seen.add(person.email);
    const inView = (id: number | null) => id !== null && person.views.includes(id);
    const always = adminEmails.includes(person.email);
    const active = always || inView(config.activeViewId);
    const treasury = inView(config.treasuryViewId);
    const sponsors = inView(config.sponsorsViewId);
    const role: Role = always || inView(config.adminViewId) ? "admin" : inView(config.pmViewId) || treasury || sponsors ? "pm" : "viewer";
    const unknown = person.values.filter((code) => !areaByCode.has(code.toLowerCase()));
    if (role === "pm" && inView(config.pmViewId) && unknown.length) warnings.push(`${person.name}: no area of the ERP has the code ${unknown.join(", ")}`);
    const areaIds = role === "pm" && inView(config.pmViewId) ? [...new Set(person.values.map((c) => areaByCode.get(c.toLowerCase())).filter((id): id is number => id !== undefined))].sort((a, b) => a - b) : [];
    const want = { name: person.name, role, active, treasury: role === "pm" && treasury, sponsors: role === "pm" && sponsors, areaIds };

    const user = byEmail.get(person.email);
    if (!user) {
      // accounts are made for the people who may enter; the others are simply not there
      if (active) changes.push({ email: person.email, name: person.name, create: true, changes: Object.fromEntries(Object.entries(want).map(([k, v]) => [k, { from: null, to: v }])) });
      continue;
    }
    const now = { name: user.name, role: user.role, active: user.active, treasury: user.treasury, sponsors: user.sponsors, areaIds: links.filter((l) => l.userId === user.id).map((l) => l.areaId).sort((a, b) => a - b) };
    const diff: RoleChange["changes"] = {};
    for (const key of Object.keys(want) as (keyof typeof want)[]) {
      if (JSON.stringify(want[key]) !== JSON.stringify(now[key])) diff[key] = { from: now[key], to: want[key] };
    }
    if (Object.keys(diff).length > 0) changes.push({ email: person.email, name: person.name, create: false, changes: diff });
  }

  // nobody locks everybody out: if no admin would be left, the admins of now stay admins
  const admins = users.filter((u) => u.role === "admin" && u.active).map((u) => u.email.toLowerCase());
  const stillAdmin = (email: string) => {
    const c = changes.find((x) => x.email === email);
    const user = byEmail.get(email);
    const role = c?.changes.role ? c.changes.role.to : user?.role;
    const active = c?.changes.active ? c.changes.active.to : user?.active;
    return role === "admin" && active === true;
  };
  const newAdmins = changes.filter((c) => c.create && c.changes.role?.to === "admin" && c.changes.active?.to === true).length;
  if (admins.filter(stillAdmin).length + newAdmins === 0 && admins.length > 0) {
    warnings.push("No active admin would be left: the admins of now stay admins");
    for (const c of changes) {
      if (!admins.includes(c.email)) continue;
      delete c.changes.role;
      delete c.changes.active;
      delete c.changes.areaIds;
      delete c.changes.treasury;
      delete c.changes.sponsors;
    }
  }
  return { changes: changes.filter((c) => c.create || Object.keys(c.changes).length > 0), warnings };
}

/** Writes what `plan` says, inside the transaction of the change that caused it. */
async function apply(tx: Tx, config: RoleSyncConfig) {
  const { changes } = await plan(tx, config);
  for (const c of changes) {
    const value = <T>(key: string, fallback: T) => (c.changes[key] ? (c.changes[key].to as T) : fallback);
    let userId: number;
    if (c.create) {
      const [row] = await tx
        .insert(appUser)
        .values({ email: c.email, name: value("name", c.name), role: value("role", "viewer" as Role), active: value("active", true), treasury: value("treasury", false), sponsors: value("sponsors", false) })
        .onConflictDoNothing()
        .returning({ id: appUser.id });
      if (!row) continue;
      userId = row.id;
    } else {
      const [row] = await tx.select({ id: appUser.id }).from(appUser).where(sql`lower(${appUser.email}) = ${c.email}`);
      if (!row) continue;
      userId = row.id;
      const set: Partial<typeof appUser.$inferInsert> = {};
      for (const key of ["name", "role", "active", "treasury", "sponsors"] as const) if (c.changes[key]) (set as Record<string, unknown>)[key] = c.changes[key].to;
      if (Object.keys(set).length > 0) await tx.update(appUser).set(set).where(eq(appUser.id, userId));
    }
    if (c.changes.areaIds) {
      const want = c.changes.areaIds.to as number[];
      const have = (await tx.select().from(userArea).where(eq(userArea.userId, userId))).map((l) => l.areaId);
      const remove = have.filter((id) => !want.includes(id));
      const add = want.filter((id) => !have.includes(id));
      if (remove.length) await tx.delete(userArea).where(and(eq(userArea.userId, userId), inArray(userArea.areaId, remove)));
      if (add.length) await tx.insert(userArea).values(add.map((areaId) => ({ userId, areaId })));
    }
  }
}

/** GET /role-sync (admins): the choices, and the groups and fields there are to choose from. */
export async function getRoleSync() {
  requireAdmin(await getCurrentUser());
  return { ...(await readConfig(db)), ...(await groupsOfRegistry(db)) };
}

async function checked(patch: Partial<RoleSyncConfig>): Promise<RoleSyncConfig> {
  const next = { ...(await readConfig(db)), ...patch };
  const { groups, fields } = await groupsOfRegistry(db);
  const groupIds = new Set(groups.map((g) => g.id));
  for (const key of ["activeViewId", "adminViewId", "pmViewId", "treasuryViewId", "sponsorsViewId"] as const) {
    if (next[key] !== null && !groupIds.has(next[key]!)) throw invalid("Choose a group of the people table (a view marked as a group)");
  }
  if (next.pmAreasFieldId !== null && !fields.some((f) => f.id === next.pmAreasFieldId)) throw invalid("The areas come from a field of the people table");
  if (next.enabled && next.activeViewId === null) throw invalid("Choose the group of who may enter before turning the link on");
  return next;
}

/** POST /role-sync/preview (admins): what would change with these choices (or the saved ones), without writing. */
export async function previewRoleSync(patch: Partial<RoleSyncConfig>) {
  requireAdmin(await getCurrentUser());
  const config = await checked({ ...patch, enabled: false });
  return db.transaction((tx) => plan(tx, config));
}

/** PUT /role-sync (admins): saves the choices; turned on, the accounts change at once. */
export async function setRoleSync(patch: Partial<RoleSyncConfig>) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const config = await checked(patch);
  const result = await runWrite(actor, async (tx) => {
    await tx.update(roleSync).set(config).where(eq(roleSync.id, 1));
    const planned = config.enabled ? await plan(tx, config) : { changes: [], warnings: [] };
    if (config.enabled) await apply(tx, config);
    return planned;
  });
  return { ...(await getRoleSync()), applied: result.changes.length, warnings: result.warnings };
}
