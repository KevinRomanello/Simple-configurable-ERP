import { eq, sql } from "drizzle-orm";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cookieFor, createUser, resetData, testApp, testConfig } from "../../../test/helpers";
import { loadAuthConfig } from "../../core/auth-config";
import { AppError, forbidden } from "../../core/errors";
import { db } from "../../db/client";
import { appUser } from "../../db/schema";
import type { GoogleClient, GoogleIdentity } from "./google";
import { signLoginState, signSessionToken } from "./tokens";

// A fake Google: the real Google client is tested in google.test.ts. Here only the routes matter.
let identity: GoogleIdentity | AppError = { email: "newcomer@team.test", name: "New Comer" };
const google: GoogleClient = {
  authorizeUrl: ({ state, challenge }) => `https://google.test/authorize?state=${state}&challenge=${challenge}`,
  identify: async () => {
    if (identity instanceof AppError) throw identity;
    return identity;
  },
};

const api = testApp({ google });
afterAll(() => api.close());

const EMAILS = ["newcomer@team.test", "boss@team.test", "gone@team.test", "viewer@team.test"];
beforeEach(async () => {
  await resetData();
  await db.delete(appUser).where(sql`lower(${appUser.email}) in (${sql.join(EMAILS.map((e) => sql`${e}`), sql`, `)})`);
  identity = { email: "newcomer@team.test", name: "New Comer" };
});

const cookiesOf = (headers: Record<string, any>): string[] => [headers["set-cookie"] ?? []].flat();
const cookieNamed = (headers: Record<string, any>, name: string) =>
  cookiesOf(headers).find((c) => c.startsWith(`${name}=`));
const valueOf = (setCookie: string) => setCookie.split(";")[0]!;

/** Walks the whole sign-in: start, "go to Google", come back with a code. */
async function signIn(callbackState?: string) {
  const anonymous = api.anonymous();
  const start = await anonymous.get("/api/auth/login");
  const loginCookie = valueOf(cookieNamed(start.headers, "erp_login")!);
  const state = new URL(start.headers.location).searchParams.get("state")!;
  return anonymous.get(`/api/auth/callback?code=abc&state=${callbackState ?? state}`, { cookie: loginCookie });
}

describe("protection of the API", () => {
  it("answers 401 without a cookie, except for the public paths", async () => {
    const anonymous = api.anonymous();
    expect((await anonymous.get("/api/areas")).status).toBe(401);
    expect((await anonymous.get("/api/me")).status).toBe(401);
    expect((await anonymous.get("/api/health")).status).toBe(200);
    expect((await anonymous.get("/api/auth/config")).status).toBe(200);
  });

  it("refuses garbage, a token signed with another secret and a token of the wrong kind", async () => {
    const user = await createUser({ email: "viewer@team.test", role: "viewer" });
    const other = new TextEncoder().encode("another-secret-another-secret-another-1234");
    const wrongSecret = await signSessionToken(user.id, other);
    const loginToken = await signLoginState({ state: "s", verifier: "v" }, testConfig.jwtSecret);
    for (const token of ["garbage", wrongSecret, loginToken]) {
      expect((await api.anonymous().withCookie("/api/me", `erp_token=${token}`)).status).toBe(401);
    }
  });

  it("refuses an expired token", async () => {
    const user = await createUser({ email: "viewer@team.test", role: "viewer" });
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(user.id))
      .setAudience("erp-session")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 25 * 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(testConfig.jwtSecret);
    expect((await api.anonymous().withCookie("/api/me", `erp_token=${expired}`)).status).toBe(401);
  });

  it("stops a deactivated person at once, token still valid", async () => {
    const user = await createUser({ email: "viewer@team.test", role: "viewer" });
    const cookie = await cookieFor(user.id);
    expect((await api.anonymous().withCookie("/api/me", cookie)).status).toBe(200);
    await db.update(appUser).set({ active: false }).where(eq(appUser.id, user.id));
    expect((await api.anonymous().withCookie("/api/me", cookie)).status).toBe(401);
  });

  it("takes the role from the database, not from the token", async () => {
    const user = await createUser({ email: "viewer@team.test", role: "viewer" });
    const cookie = await cookieFor(user.id);
    await db.update(appUser).set({ role: "admin" }).where(eq(appUser.id, user.id));
    expect((await api.anonymous().withCookie("/api/me", cookie)).body.role).toBe("admin");
  });

  it("refuses writes that come from another site, accepts our own pages and non-browser clients", async () => {
    const body = { areaCode: "sw", name: "P" };
    const proxied = { host: "api:3000" }; // a proxy in front of the API rewrites the Host header
    expect((await api.post("/api/projects", body, { ...proxied, origin: "https://evil.example" })).status).toBe(403);
    expect((await api.post("/api/projects", body, { ...proxied, origin: "not a url" })).status).toBe(403);
    // PUBLIC_URL of the tests is http://localhost:5173
    expect((await api.post("/api/projects", body, { ...proxied, origin: "http://localhost:5173" })).status).toBe(201);
    // ...or the very host the request was addressed to
    expect((await api.post("/api/projects", body, { host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" })).status).toBe(201);
    expect((await api.post("/api/projects", body)).status).toBe(201); // no Origin: curl, scripts
  });
});

describe("GET /api/me", () => {
  it("tells who is signed in and what they may do", async () => {
    const pm = await createUser({ email: "viewer@team.test", role: "pm", areas: ["sw"] });
    const me = await api.anonymous().withCookie("/api/me", await cookieFor(pm.id));
    expect(me.body).toMatchObject({
      email: "viewer@team.test",
      role: "pm",
      areaIds: pm.areaIds,
      permissions: { canEditShared: false, canManageSuppliers: true, canViewHistory: true, canManageUsers: false },
    });
  });

  it("gives a viewer no powers and an admin all of them", async () => {
    expect((await api.as({ email: "viewer@team.test", role: "viewer" }).get("/api/me")).body.permissions).toEqual({
      canEditShared: false, canManageSuppliers: false, canViewHistory: false, canManageUsers: false,
    });
    expect((await api.get("/api/me")).body.permissions).toEqual({
      canEditShared: true, canManageSuppliers: true, canViewHistory: true, canManageUsers: true,
    });
  });
});

describe("signing in with Google", () => {
  it("sends the person to Google and remembers the attempt in a short-lived cookie", async () => {
    const reply = await api.anonymous().get("/api/auth/login");
    expect(reply.status).toBe(302);
    expect(reply.headers.location).toMatch(/^https:\/\/google\.test\/authorize\?state=/);
    const cookie = cookieNamed(reply.headers, "erp_login")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=600/i);
  });

  it("creates a viewer at the first login and starts a 24-hour session", async () => {
    const reply = await signIn();
    expect(reply.status).toBe(302);
    expect(reply.headers.location).toBe("/");

    const session = cookieNamed(reply.headers, "erp_token")!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/Path=\/api/i);
    expect(session).toMatch(/Max-Age=86400/i);
    expect(session).not.toMatch(/Secure/i); // the test address is http

    const me = await api.anonymous().withCookie("/api/me", valueOf(session));
    expect(me.body).toMatchObject({ email: "newcomer@team.test", name: "New Comer", role: "viewer", areaIds: [] });
  });

  it("makes an address listed in ADMIN_EMAILS an admin, and promotes an existing account", async () => {
    identity = { email: "Boss@Team.test", name: "The Boss" };
    const first = await signIn();
    expect((await api.anonymous().withCookie("/api/me", valueOf(cookieNamed(first.headers, "erp_token")!))).body.role).toBe("admin");

    await db.update(appUser).set({ role: "viewer" }).where(sql`lower(${appUser.email}) = 'boss@team.test'`);
    const again = await signIn();
    expect((await api.anonymous().withCookie("/api/me", valueOf(cookieNamed(again.headers, "erp_token")!))).body.role).toBe("admin");
  });

  it("keeps the account, role and areas of someone who signs in again", async () => {
    await createUser({ email: "newcomer@team.test", role: "pm", areas: ["sw"] });
    const reply = await signIn();
    const me = await api.anonymous().withCookie("/api/me", valueOf(cookieNamed(reply.headers, "erp_token")!));
    expect(me.body).toMatchObject({ role: "pm" });
    expect(me.body.areaIds).toHaveLength(1);
    expect((await db.select().from(appUser).where(sql`lower(${appUser.email}) = 'newcomer@team.test'`))).toHaveLength(1);
  });

  /** The sign-in failed: back to the home page with a fixed word and no session. */
  const failure = (reply: { status: number; headers: Record<string, any> }) => {
    expect(reply.status).toBe(302);
    expect(cookieNamed(reply.headers, "erp_token")).toBeUndefined();
    return String(reply.headers.location).replace(/^\/\?login_error=/, "");
  };

  it("goes back to the home page with a fixed word when something is wrong", async () => {
    expect(failure(await signIn("someone-elses-state"))).toBe("expired");
    expect(failure(await api.anonymous().get("/api/auth/callback?code=abc&state=x"))).toBe("expired"); // no login cookie
    expect(failure(await api.anonymous().get("/api/auth/callback?error=access_denied"))).toBe("cancelled");
    expect(failure(await api.anonymous().get("/api/auth/callback"))).toBe("cancelled");

    identity = forbidden("Only team.test accounts can sign in", "domain");
    expect(failure(await signIn())).toBe("domain");

    // Anything else, even a message that looks helpful, is hidden behind one word.
    identity = new AppError(401, "Google refused the login");
    expect(failure(await signIn())).toBe("failed");
    identity = { get email(): string { throw new Error("boom"); } } as unknown as GoogleIdentity;
    expect(failure(await signIn())).toBe("failed");
  });

  it("refuses a deactivated account", async () => {
    const gone = await createUser({ email: "gone@team.test", role: "viewer" });
    await db.update(appUser).set({ active: false }).where(eq(appUser.id, gone.id));
    identity = { email: "gone@team.test", name: "Gone" };
    expect(failure(await signIn())).toBe("deactivated");
  });

  it("is unavailable when Google is not configured", async () => {
    const without = testApp({ google: null });
    expect((await without.anonymous().get("/api/auth/login")).status).toBe(503);
    expect((await without.anonymous().get("/api/auth/config")).body).toMatchObject({ google: false, devLogin: false });
    await without.app.close();
  });
});

describe("developer login", () => {
  it("does not exist unless DEV_LOGIN_EMAIL is set", async () => {
    expect((await api.anonymous().get("/api/auth/dev-login")).status).toBe(404);
    expect((await api.anonymous().get("/api/auth/config")).body.devLogin).toBe(false);
  });

  it("signs in as that address when it is set (and as admin if it is in ADMIN_EMAILS)", async () => {
    const config = loadAuthConfig({
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-test-secret-test-secret-123456",
      PUBLIC_URL: "http://localhost:5173",
      ADMIN_EMAILS: "boss@team.test",
      DEV_LOGIN_EMAIL: "boss@team.test",
    });
    const dev = testApp({ config });
    expect((await dev.anonymous().get("/api/auth/config")).body.devLogin).toBe(true);
    const reply = await dev.anonymous().get("/api/auth/dev-login");
    expect(reply.status).toBe(302);
    const me = await dev.anonymous().withCookie("/api/me", valueOf(cookieNamed(reply.headers, "erp_token")!));
    expect(me.body).toMatchObject({ email: "boss@team.test", role: "admin" });
    await dev.app.close();
  });
});

describe("signing out", () => {
  it("clears the cookie", async () => {
    const reply = await api.post("/api/auth/logout", {});
    expect(reply.status).toBe(204);
    expect(cookieNamed(reply.headers, "erp_token")).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });
});
