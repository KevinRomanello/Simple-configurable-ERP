import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, resetData, testApp } from "../../../test/helpers";
import { loadAuthConfig } from "../../core/auth-config";
import { db } from "../../db/client";
import { appUser } from "../../db/schema";
import { SESSION_COOKIE } from "./auth.routes";
import { signSessionToken } from "./tokens";

// Signing in through the organisation's login proxy: the person is whoever the header says.
// The proxy itself (and keeping everybody else away from the API) is not tested here: it is network.
const config = loadAuthConfig({
  NODE_ENV: "test",
  PUBLIC_URL: "http://localhost:5173",
  ADMIN_EMAILS: "boss@team.test",
  TRUSTED_EMAIL_HEADER: "X-Email",
});
const api = testApp({ config });
afterAll(() => api.close());

const EMAILS = ["newcomer@team.test", "boss@team.test", "pm-sw@team.test", "viewer@team.test", "gone@team.test", "mario.rossi@team.test", "racer@team.test"];
beforeEach(async () => {
  await resetData();
  await db.delete(appUser).where(sql`lower(${appUser.email}) in (${sql.join(EMAILS.map((e) => sql`${e}`), sql`, `)})`);
});

type Method = "GET" | "POST" | "PATCH" | "DELETE";
async function call(method: Method, url: string, headers: Record<string, string>, payload?: object) {
  const response = await api.app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.body ? response.json() : null, headers: response.headers };
}
const as = (email: string, extra: Record<string, string> = {}) => ({ "x-email": email, ...extra });
const rowsOf = (email: string) => db.select().from(appUser).where(eq(appUser.email, email));

describe("who is signed in", () => {
  it("is nobody without the header, or with something that is not exactly one address", async () => {
    expect((await call("GET", "/api/me", {})).status).toBe(401);
    for (const value of ["", "garbage", "a@team.test, b@team.test"]) {
      expect([value, (await call("GET", "/api/me", as(value))).status]).toEqual([value, 401]);
    }
  });

  it("does not accept the cookie of a session: only the header counts", async () => {
    const admin = await createUser({ email: "boss@team.test", role: "admin" });
    const cookie = `${SESSION_COOKIE}=${await signSessionToken(admin.id, config.jwtSecret)}`;
    expect((await call("GET", "/api/me", { cookie })).status).toBe(401);
    // with the header of somebody else, the cookie of the admin does not make them an admin
    const me = await call("GET", "/api/me", { cookie, ...as("viewer@team.test") });
    expect(me.body).toMatchObject({ email: "viewer@team.test", role: "viewer" });
  });

  it("makes a viewer of a person seen for the first time, named after their email", async () => {
    const me = await call("GET", "/api/me", as("mario.rossi@team.test"));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: "mario.rossi@team.test", name: "Mario Rossi", role: "viewer", areaIds: [] });
    expect(me.body.permissions.canEditShared).toBe(false);
  });

  it("finds the same person whatever the case of the address, without making a second account", async () => {
    const first = await call("GET", "/api/me", as("Mario.Rossi@Team.Test"));
    const second = await call("GET", "/api/me", as("mario.rossi@team.test"));
    expect(second.body.id).toBe(first.body.id);
    expect(await rowsOf("mario.rossi@team.test")).toHaveLength(1);
  });

  it("makes the emails of ADMIN_EMAILS admins, and an existing person an admin from then on", async () => {
    expect((await call("GET", "/api/me", as("boss@team.test"))).body.role).toBe("admin");
    await createUser({ email: "newcomer@team.test", role: "viewer" });
    expect((await call("GET", "/api/me", as("newcomer@team.test"))).body.role).toBe("viewer");
  });

  it("keeps the name an account already has: the one from the email is only a guess", async () => {
    await db.insert(appUser).values({ email: "mario.rossi@team.test", name: "Mario Rossi Junior", role: "viewer" });
    expect((await call("GET", "/api/me", as("mario.rossi@team.test"))).body.name).toBe("Mario Rossi Junior");
  });

  it("makes one account when a new person's first requests arrive together", async () => {
    // connections that are already open, as on a server that has been running: only then do the requests overlap
    await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`select pg_sleep(0.05)`)));
    const answers = await Promise.all(Array.from({ length: 10 }, () => call("GET", "/api/me", as("racer@team.test"))));
    expect(answers.map((a) => a.status)).toEqual(Array(10).fill(200));
    expect(await rowsOf("racer@team.test")).toHaveLength(1);
  });

  it("refuses a deactivated person, even though the proxy let them through", async () => {
    const gone = await createUser({ email: "gone@team.test", role: "pm", areas: ["sw"] });
    await db.update(appUser).set({ active: false }).where(eq(appUser.id, gone.id));
    const me = await call("GET", "/api/me", as("gone@team.test"));
    expect(me.status).toBe(403);
    expect(me.body.error).toMatch(/deactivated/);
    expect((await call("GET", "/api/health", {})).status).toBe(200);
  });
});

describe("what a signed-in person may do: the roles stay ours", () => {
  it("lets a project manager write in their own area and nowhere else", async () => {
    await createUser({ email: "pm-sw@team.test", role: "pm", areas: ["sw"] });
    const own = await call("POST", "/api/projects", as("pm-sw@team.test"), { areaCode: "sw", name: "Mine" });
    const other = await call("POST", "/api/projects", as("pm-sw@team.test"), { areaCode: "hw", name: "Not mine" });
    expect([own.status, other.status]).toEqual([201, 403]);
    expect((await call("GET", "/api/me", as("pm-sw@team.test"))).body.areaIds).toHaveLength(1);
  });

  it("lets a person seen for the first time read and not write", async () => {
    expect((await call("GET", "/api/areas/sw/sheet", as("newcomer@team.test"))).status).toBe(200);
    expect((await call("POST", "/api/projects", as("newcomer@team.test"), { areaCode: "sw", name: "X" })).status).toBe(403);
  });

  it("records who made a change in the history", async () => {
    await createUser({ email: "pm-sw@team.test", role: "pm", areas: ["sw"] });
    await call("POST", "/api/projects", as("pm-sw@team.test"), { areaCode: "sw", name: "Traced" });
    const history = await call("GET", "/api/audit", as("boss@team.test"));
    expect(JSON.stringify(history.body)).toContain("pm-sw@team.test");
  });
});

describe("requests from other sites", () => {
  it("are refused even with the header: the proxy adds it to every request of a signed-in browser", async () => {
    await createUser({ email: "pm-sw@team.test", role: "pm", areas: ["sw"] });
    const body = { areaCode: "sw", name: "Forged" };
    const foreign = await call("POST", "/api/projects", as("pm-sw@team.test", { origin: "https://evil.example" }), body);
    expect(foreign.status).toBe(403);
    expect(foreign.body.error).toMatch(/Cross-site/);
    const ours = await call("POST", "/api/projects", as("pm-sw@team.test", { origin: "http://localhost:5173" }), body);
    expect(ours.status).toBe(201);
  });
});

describe("the other ways of signing in", () => {
  it("are gone, and the page is told there is a proxy", async () => {
    const options = await call("GET", "/api/auth/config", {});
    expect(options.body).toMatchObject({ proxy: true, google: false, devLogin: false });
    expect((await call("GET", "/api/auth/login", {})).status).toBe(503);
    expect((await call("GET", "/api/auth/dev-login", {})).status).toBe(404);
  });

  it("listens to the header it was told to, and to that one only", async () => {
    const other = testApp({
      config: loadAuthConfig({ NODE_ENV: "test", PUBLIC_URL: "http://localhost:5173", TRUSTED_EMAIL_HEADER: "X-Forwarded-Email" }),
    });
    try {
      const get = (headers: Record<string, string>) => other.app.inject({ method: "GET", url: "/api/me", headers }).then((r) => r.statusCode);
      expect(await get({ "x-email": "newcomer@team.test" })).toBe(401);
      expect(await get({ "X-Forwarded-Email": "newcomer@team.test" })).toBe(200);
    } finally {
      await other.app.close();
    }
  });
});
