import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { apiToken, appUser } from "../../db/schema/platform";
import { loadUser } from "../users/users.service";
import { getCurrentUser, requireAdmin, type User } from "./auth.service";

// Keys for services (n8n, the bot, the website): `Authorization: Bearer <key>` makes a request act as the user
// the key was made for, with that user's role and permissions (docs/anagrafiche.md, §10.1). Only the SHA-256 of
// a key is kept, so a copy of the database does not give the keys away; a key is shown once, when made.

const PREFIX = "erp_";
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/** The active user of a key that exists and is not revoked, or null. */
export async function userOfToken(key: string): Promise<User | null> {
  if (!key.startsWith(PREFIX) || key.length > 200) return null;
  const [row] = await db.select({ userId: apiToken.userId }).from(apiToken).where(and(eq(apiToken.tokenHash, hash(key)), isNull(apiToken.revokedAt)));
  return row ? loadUser(row.userId) : null;
}

const maker = alias(appUser, "maker");

/** GET /tokens (admins): the keys, never their value. */
export async function listTokens() {
  requireAdmin(await getCurrentUser());
  return db
    .select({ id: apiToken.id, name: apiToken.name, userId: apiToken.userId, userEmail: appUser.email, userName: appUser.name, createdAt: apiToken.createdAt, createdBy: maker.name, revokedAt: apiToken.revokedAt })
    .from(apiToken)
    .innerJoin(appUser, eq(appUser.id, apiToken.userId))
    .leftJoin(maker, eq(maker.id, apiToken.createdBy))
    .orderBy(desc(apiToken.id));
}

/** POST /tokens (admins): a new key for a user; the answer is the only time it is seen. */
export async function createToken(input: { name: string; userId: number }) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const [user] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, input.userId));
  if (!user) throw notFound("User");
  const key = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  const [row] = await runWrite(actor, (tx) => tx.insert(apiToken).values({ name: input.name, tokenHash: hash(key), userId: input.userId, createdBy: actor.id }).returning({ id: apiToken.id }));
  return { id: row!.id, name: input.name, token: key };
}

/** PATCH /tokens/:id (admins): a new name; the key stays the same. */
export async function renameToken(id: number, name: string) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const done = await runWrite(actor, (tx) => tx.update(apiToken).set({ name }).where(eq(apiToken.id, id)).returning({ id: apiToken.id }));
  if (done.length === 0) throw notFound("Token");
  return { id, name };
}

/** DELETE /tokens/:id (admins): the key stops working at once; the row stays, for the history. */
export async function revokeToken(id: number) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const done = await runWrite(actor, (tx) => tx.update(apiToken).set({ revokedAt: new Date() }).where(and(eq(apiToken.id, id), isNull(apiToken.revokedAt))).returning({ id: apiToken.id }));
  if (done.length === 0) throw notFound("Token");
}
