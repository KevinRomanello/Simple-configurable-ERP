import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { appUser, area, userArea } from "../../db/schema";
import { getCurrentUser, requireAdmin, type Role, type User } from "../auth/auth.service";

type Reader = Pick<typeof db, "select">;

async function withAreas(reader: Reader, row: typeof appUser.$inferSelect): Promise<User> {
  const areas = await reader.select({ areaId: userArea.areaId }).from(userArea).where(eq(userArea.userId, row.id));
  return { id: row.id, email: row.email, name: row.name, role: row.role, areaIds: areas.map((a) => a.areaId).sort((a, b) => a - b) };
}

/** The active user with this id, or null (unknown or deactivated people have no access). */
export async function loadUser(id: number): Promise<User | null> {
  const [row] = await db.select().from(appUser).where(and(eq(appUser.id, id), eq(appUser.active, true)));
  return row ? withAreas(db, row) : null;
}

/**
 * What happens when someone has proved who they are with Google: their account is found, or
 * created as a `viewer` on the first login. Emails listed in ADMIN_EMAILS are always admins.
 * A deactivated account is refused.
 */
export async function loginWithIdentity(
  identity: { email: string; name: string },
  adminEmails: string[],
): Promise<User> {
  const email = identity.email.trim().toLowerCase();
  const shouldBeAdmin = adminEmails.includes(email);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(appUser).where(sql`lower(${appUser.email}) = ${email}`);

    if (!existing) {
      const [created] = await tx
        .insert(appUser)
        .values({ email, name: identity.name, role: shouldBeAdmin ? "admin" : "viewer" })
        .returning();
      return withAreas(tx, created!);
    }
    if (!existing.active) throw forbidden("This account has been deactivated", "deactivated");

    // Only write when something changed: every write is recorded in the history.
    const patch: Partial<typeof appUser.$inferInsert> = {};
    if (existing.name !== identity.name) patch.name = identity.name;
    if (shouldBeAdmin && existing.role !== "admin") patch.role = "admin";
    if (Object.keys(patch).length === 0) return withAreas(tx, existing);
    const [updated] = await tx.update(appUser).set(patch).where(eq(appUser.id, existing.id)).returning();
    return withAreas(tx, updated!);
  });
}

export interface UserRow extends User {
  active: boolean;
}

/** Every person who has signed in at least once (admins only). */
export async function listUsers(): Promise<UserRow[]> {
  requireAdmin(await getCurrentUser());
  const rows = await db.select().from(appUser).orderBy(asc(sql`lower(${appUser.name})`));
  const links = await db.select().from(userArea);
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    areaIds: links.filter((l) => l.userId === row.id).map((l) => l.areaId).sort((a, b) => a - b),
  }));
}

/** Changes role, active flag and assigned areas of a person (admins only). */
export async function updateUser(
  userId: number,
  patch: { role?: Role; active?: boolean; areaIds?: number[] },
): Promise<UserRow> {
  const actor = await getCurrentUser();
  requireAdmin(actor);

  if (patch.areaIds) {
    const unique = [...new Set(patch.areaIds)];
    const known = unique.length ? await db.select({ id: area.id }).from(area).where(inArray(area.id, unique)) : [];
    if (known.length !== unique.length) throw invalid("Unknown area");
    patch = { ...patch, areaIds: unique };
  }

  await runWrite(actor, async (tx) => {
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
