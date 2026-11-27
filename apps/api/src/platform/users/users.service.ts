import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../../core/contracts";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { appUser, area, userArea, userFlag } from "../../db/schema/platform";
import { getCurrentUser, requireAdmin, type Role, type User } from "../auth/auth.service";
import { declaredFlags, everyFlag } from "../platform.public";

/** The person with their areas and their boxes: read with one query, since every request starts here. */
async function withAreas(reader: Db, row: typeof appUser.$inferSelect): Promise<User> {
  const { rows } = await reader.execute<{ area_ids: number[]; flags: string[] }>(sql`select
    coalesce((select array_agg(area_id order by area_id) from user_area where user_id = ${row.id}), '{}') as area_ids,
    coalesce((select array_agg(flag order by flag) from user_flag where user_id = ${row.id}), '{}') as flags`);
  return { id: row.id, email: row.email, name: row.name, role: row.role, flags: rows[0]!.flags, areaIds: rows[0]!.area_ids };
}

/** The active user with this id, or null (unknown or deactivated people have no access). */
export async function loadUser(id: number): Promise<User | null> {
  const [row] = await db.select().from(appUser).where(and(eq(appUser.id, id), eq(appUser.active, true)));
  return row ? withAreas(db, row) : null;
}

/**
 * What happens when someone has proved who they are (with Google, or through the login proxy):
 * their account is found, or created as a `viewer` on the first time. Emails listed in
 * ADMIN_EMAILS are always admins. A deactivated account is refused.
 * `updateName: false` keeps the name already on the account (the proxy only knows the email,
 * so the name it gives is a guess that must not replace a better one).
 */
export async function loginWithIdentity(
  identity: { email: string; name: string },
  adminEmails: string[],
  options: { updateName?: boolean } = {},
): Promise<User> {
  const email = identity.email.trim().toLowerCase();
  const shouldBeAdmin = adminEmails.includes(email);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(appUser).where(sql`lower(${appUser.email}) = ${email}`);

    if (!existing) {
      const [created] = await tx
        .insert(appUser)
        .values({ email, name: identity.name, role: shouldBeAdmin ? "admin" : "viewer" })
        .onConflictDoNothing()
        .returning();
      if (created) return withAreas(tx, created);
      // two requests of a person seen for the first time, at once: the other one made the account
      const [theirs] = await tx.select().from(appUser).where(sql`lower(${appUser.email}) = ${email}`);
      return withAreas(tx, theirs!);
    }
    if (!existing.active) throw forbidden("This account has been deactivated", "deactivated");

    // Only write when something changed: every write is recorded in the history.
    const patch: Partial<typeof appUser.$inferInsert> = {};
    if (options.updateName !== false && existing.name !== identity.name) patch.name = identity.name;
    if (shouldBeAdmin && existing.role !== "admin") patch.role = "admin";
    if (Object.keys(patch).length === 0) return withAreas(tx, existing);
    const [updated] = await tx.update(appUser).set(patch).where(eq(appUser.id, existing.id)).returning();
    return withAreas(tx, updated!);
  });
}

export interface UserRow extends User {
  active: boolean;
  /** Role, areas, boxes and "active" come from another module (the registry, docs/anagrafiche.md §9): not changed here. */
  managed: boolean;
}

/**
 * Which of these emails have their role decided elsewhere. Set by the module that decides it (rolesync), so
 * this module does not depend on it: without one, nobody is managed.
 */
type ManagedCheck = (emails: string[]) => Promise<Set<string>>;
let managedCheck: ManagedCheck = async () => new Set();
export function setManagedCheck(check: ManagedCheck) {
  managedCheck = check;
}

/** Every person who has signed in at least once, or was added (admins only). */
export async function listUsers(): Promise<UserRow[]> {
  requireAdmin(await getCurrentUser());
  const rows = await db.select().from(appUser).orderBy(asc(sql`lower(${appUser.name})`));
  const links = await db.select().from(userArea);
  const flags = await db.select().from(userFlag).orderBy(asc(userFlag.flag));
  const managed = await managedCheck(rows.map((r) => r.email.toLowerCase()));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    flags: flags.filter((f) => f.userId === row.id).map((f) => f.flag),
    active: row.active,
    managed: managed.has(row.email.toLowerCase()),
    areaIds: links.filter((l) => l.userId === row.id).map((l) => l.areaId).sort((a, b) => a - b),
  }));
}

/**
 * POST /users (admins): adds a person before they sign in, or an account for a service (n8n, the bot) that
 * then gets a key (Settings › API tokens).
 */
export async function createUser(input: { email: string; name: string; role: Role }): Promise<UserRow> {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: appUser.id }).from(appUser).where(sql`lower(${appUser.email}) = ${email}`);
  if (existing) throw conflict("There is already a user with this email");
  const [row] = await runWrite(actor, (tx) => tx.insert(appUser).values({ email, name: input.name.trim(), role: input.role }).returning({ id: appUser.id }));
  return (await listUsers()).find((u) => u.id === row!.id)!;
}

/** Ticks or clears one box of a person, inside the transaction of whoever decides it (the registry gives the roles in `rolesync`). */
export async function setUserFlag(tx: Db, userId: number, flag: string, on: boolean) {
  if (on) await tx.insert(userFlag).values({ userId, flag }).onConflictDoNothing();
  else await tx.delete(userFlag).where(and(eq(userFlag.userId, userId), eq(userFlag.flag, flag)));
}

/** The boxes the modules that are on offer, for the Users page (admins only). */
export async function listFlags() {
  requireAdmin(await getCurrentUser());
  return declaredFlags();
}

/**
 * Changes role, boxes (`flags`: the whole list that is wanted), active flag and assigned areas of a person (admins only).
 * A box says which roles may have it (the treasury and the sponsors boxes are for project managers): asking for one for another
 * role is refused, and a person made something else loses the boxes that role cannot have, also those of a module that is off. A box
 * of a module that is off is otherwise left as it is: it is waiting for its module to be turned on again.
 */
export async function updateUser(
  userId: number,
  patch: { role?: Role; flags?: string[]; active?: boolean; areaIds?: number[] },
): Promise<UserRow> {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const [person] = await db.select({ email: appUser.email }).from(appUser).where(eq(appUser.id, userId));
  if (person && (await managedCheck([person.email.toLowerCase()])).has(person.email.toLowerCase())) {
    throw conflict("This person's role comes from the registry (Settings › Access): change it there");
  }

  const boxes = declaredFlags();
  const unknown = (patch.flags ?? []).filter((key) => !boxes.some((b) => b.key === key));
  if (unknown.length > 0) throw invalid(`Unknown box: ${unknown.join(", ")}`);

  if (patch.areaIds) {
    const unique = [...new Set(patch.areaIds)];
    const known = unique.length ? await db.select({ id: area.id }).from(area).where(inArray(area.id, unique)) : [];
    if (known.length !== unique.length) throw invalid("Unknown area");
    patch = { ...patch, areaIds: unique };
  }

  await runWrite(actor, async (tx) => {
    // Two admins stepping down at the same moment must not both pass the check below: whoever
    // comes second waits here and then sees the first one's change.
    await tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.role, "admin")).orderBy(asc(appUser.id)).for("update");
    const [target] = await tx.select().from(appUser).where(eq(appUser.id, userId));
    if (!target) throw notFound("User");

    // There must always be somebody who can manage users.
    const role = patch.role ?? target.role;
    const active = patch.active ?? target.active;
    if (target.role === "admin" && target.active && !(role === "admin" && active)) {
      const [others] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(appUser)
        .where(and(eq(appUser.role, "admin"), eq(appUser.active, true), ne(appUser.id, userId)));
      if ((others?.n ?? 0) === 0) throw conflict("There must be at least one active admin");
    }

    // the boxes: the ones asked for must suit the role; the ones a role cannot have are cleared; the ones of a module that is off stay
    for (const key of patch.flags ?? []) {
      const box = boxes.find((b) => b.key === key)!;
      if (!box.roles.includes(role)) throw invalid(`The ${box.label} box is for ${box.roles.map((r) => (r === "pm" ? "project managers" : `${r}s`)).join(" and ")}: change the role first`);
    }
    const have = (await tx.select({ flag: userFlag.flag }).from(userFlag).where(eq(userFlag.userId, userId))).map((r) => r.flag);
    const wanted = patch.flags ?? have;
    const all = everyFlag();
    const keep = (key: string) => {
      const box = boxes.find((b) => b.key === key);
      if (box) return wanted.includes(key) && box.roles.includes(role);
      // a box of a module that is off waits for it, but only if the person's role may have it: a pm made a viewer loses it now
      const sleeping = all.find((b) => b.key === key);
      return sleeping === undefined || sleeping.roles.includes(role);
    };
    const next = [...new Set([...have, ...wanted])].filter(keep);
    const drop = have.filter((key) => !next.includes(key));
    if (drop.length > 0) await tx.delete(userFlag).where(and(eq(userFlag.userId, userId), inArray(userFlag.flag, drop)));
    const add = next.filter((key) => !have.includes(key));
    if (add.length > 0) await tx.insert(userFlag).values(add.map((flag) => ({ userId, flag })));

    const changes: Partial<typeof appUser.$inferInsert> = {};
    if (patch.role !== undefined && patch.role !== target.role) changes.role = patch.role;
    if (patch.active !== undefined && patch.active !== target.active) changes.active = patch.active;
    if (Object.keys(changes).length > 0) await tx.update(appUser).set(changes).where(eq(appUser.id, userId));

    if (patch.areaIds) {
      const current = (await tx.select().from(userArea).where(eq(userArea.userId, userId))).map((l) => l.areaId);
      const remove = current.filter((id) => !patch.areaIds!.includes(id));
      const add = patch.areaIds.filter((id) => !current.includes(id));
      if (remove.length) await tx.delete(userArea).where(and(eq(userArea.userId, userId), inArray(userArea.areaId, remove)));
      if (add.length) await tx.insert(userArea).values(add.map((areaId) => ({ userId, areaId })));
    }
  });

  const row = (await listUsers()).find((u) => u.id === userId);
  return row!;
}
