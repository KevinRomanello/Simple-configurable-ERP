import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { loadAuthConfig } from "../src/core/auth-config";
import { db, pool } from "../src/db/client";
import { appUser, area, fund, userArea } from "../src/db/schema";
import type { User } from "../src/modules/auth/auth.service";
import { SESSION_COOKIE } from "../src/modules/auth/auth.routes";
import type { GoogleClient } from "../src/modules/auth/google";
import { signSessionToken } from "../src/modules/auth/tokens";

export interface Reply {
  status: number;
  body: any;
  headers: Record<string, any>;
}

export const testConfig = loadAuthConfig({
  NODE_ENV: "test",
  JWT_SECRET: "test-secret-test-secret-test-secret-123456",
  PUBLIC_URL: "http://localhost:5173",
  ADMIN_EMAILS: "boss@team.test",
});

/** A person to sign in as, described by role and by the codes of the areas they may change. */
export interface Person {
  email: string;
  role: User["role"];
  areas?: string[];
}

export const ADMIN: Person = { email: "admin@team.test", role: "admin" };

/** Creates (or updates) a user directly in the database and returns it. */
export async function createUser(person: Person): Promise<User & { active: boolean }> {
  const email = person.email.toLowerCase();
  const [existing] = await db.select().from(appUser).where(sql`lower(${appUser.email}) = ${email}`);
  const [row] = existing
    ? await db.update(appUser).set({ role: person.role, active: true }).where(eq(appUser.id, existing.id)).returning()
    : await db.insert(appUser).values({ email, name: email.split("@")[0]!, role: person.role }).returning();

  await db.delete(userArea).where(eq(userArea.userId, row!.id));
  const areaIds: number[] = [];
  for (const code of person.areas ?? []) {
    const [found] = await db.select().from(area).where(eq(area.code, code));
    await db.insert(userArea).values({ userId: row!.id, areaId: found!.id });
    areaIds.push(found!.id);
  }
  return { id: row!.id, email, name: row!.name, role: row!.role, areaIds, active: true };
}

/** The Cookie header of a signed-in user. */
export async function cookieFor(userId: number): Promise<string> {
  return `${SESSION_COOKIE}=${await signSessionToken(userId, testConfig.jwtSecret)}`;
}

/**
 * An app plus a tiny JSON client. By default it is signed in as an admin; `as(person)` gives a
 * client for somebody else, `anonymous()` one that is not signed in.
 */
export function testApp(options: { google?: GoogleClient | null; config?: typeof testConfig } = {}) {
  const app: FastifyInstance = buildApp({ config: options.config ?? testConfig, google: options.google ?? null });

  function client(person: Person | null) {
    let cookie: Promise<string | null> | undefined;
    const cookieOnce = () => (cookie ??= person ? createUser(person).then((u) => cookieFor(u.id)) : Promise.resolve(null));

    async function call(
      method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
      url: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<Reply> {
      const signedIn = await cookieOnce();
      const response = await app.inject({
        method,
        url,
        headers: { ...(signedIn ? { cookie: signedIn } : {}), ...headers },
        ...(body === undefined ? {} : { payload: body as object }),
      });
      let parsed: any = null;
      try {
        parsed = response.body ? response.json() : null;
      } catch {
        parsed = response.body; // a redirect has no JSON body
      }
      return { status: response.statusCode, body: parsed, headers: response.headers };
    }

    return {
      get: (url: string, headers?: Record<string, string>) => call("GET", url, undefined, headers),
      post: (url: string, body: unknown, headers?: Record<string, string>) => call("POST", url, body, headers),
      patch: (url: string, body: unknown) => call("PATCH", url, body),
      put: (url: string, body: unknown) => call("PUT", url, body),
      del: (url: string) => call("DELETE", url),
      /** A request with an arbitrary Cookie header (expired, forged...). */
      withCookie: (url: string, cookieHeader: string) =>
        app.inject({ method: "GET", url, headers: { cookie: cookieHeader } }).then((r) => ({
          status: r.statusCode,
          body: r.body ? r.json() : null,
        })),
    };
  }

  return {
    ...client(ADMIN),
    as: (person: Person) => client(person),
    anonymous: () => client(null),
    app,
    async close() {
      await app.close();
      await pool.end();
    },
  };
}

/** Empties everything a test can create, keeping the seed (season, areas, team fund) and the users. */
export async function resetData() {
  await db.execute(
    sql`truncate table line_figures, budget_line, project, fund_contract, team_inflow, bank_snapshot, supplier, audit_log restart identity cascade`,
  );
  await db.delete(fund).where(eq(fund.kind, "external"));
}
