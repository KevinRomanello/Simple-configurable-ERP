import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, testApp } from "../test/helpers";
import { db } from "./db/client";

// SQL injection: every value reaches the database as a parameter. These tests keep it that way,
// one by looking at the code (nothing can build SQL out of text) and one by attacking the API.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("the code cannot build SQL out of text", () => {
  const files = [join(__dirname), join(__dirname, "../../../tools/import-xlsx/src")].flatMap(sourceFiles);

  it("never uses the escape hatches that skip parameters", () => {
    const offenders = files.filter((file) => /sql\.raw\(|\.unsafe\(/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("passes only `sql` templates (parameterized) to execute() and query()", () => {
    const offenders = files.filter((file) => /\.(execute|query)\((?!\s*sql`)/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never accepts free text without a maximum length in a route or schema", () => {
    const inputs = files.filter((file) => /\.(routes|schema)\.ts$/.test(file));
    expect(inputs.length).toBeGreaterThan(5);
    const unbounded = inputs.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.includes("z.string()") && !line.includes(".max("))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(unbounded).toEqual([]); // use shortText(), longText or lookupCode from core/validation.ts
  });

  it("finds the files it is supposed to read", () => {
    expect(files.length).toBeGreaterThan(30); // a path mistake must not make the checks pass for free
  });
});

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const PAYLOADS = [
  "'; drop table supplier; --",
  "' OR '1'='1",
  '"; drop table project; --',
  "Robert'); DROP TABLE budget_line;--",
  "x' UNION SELECT email FROM app_user --",
  "$1; select pg_sleep(5)",
  "\\'; truncate audit_log; --",
  "%' or 1=1 --",
];

const tablesLeft = async () => {
  const result = await db.execute(
    sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('supplier','project','budget_line','audit_log','app_user','fund','line_figures','line_fund')`,
  );
  return (result.rows[0] as { n: number }).n;
};

describe("attacking the API", () => {
  it("keeps hostile text as plain text in every field where a name can be typed", async () => {
    for (const text of PAYLOADS) {
      const supplier = await api.post("/api/suppliers", { name: text });
      expect(supplier.status).toBe(201);
      expect(supplier.body.name).toBe(text);

      const project = (await api.post("/api/projects", { areaCode: "sw", name: text, ownerName: text })).body;
      expect(project.name).toBe(text);
      expect((await api.post(`/api/projects/${project.id}/lines`, { item: text, note: text })).status).toBe(201);
      const sponsor = await api.post("/api/funds", { name: text, vatRate: 22, group: text });
      expect(sponsor.status).toBe(201);
      expect(sponsor.body.name).toBe(text);
      expect((await api.put(`/api/funds/${sponsor.body.id}/contracts/estimate`, { amount: "1" })).status).toBe(200);
      expect((await api.post("/api/inflows", { phase: "actual", sourceName: text, amount: "1" })).status).toBe(201);
    }
    expect(await tablesLeft()).toBe(8);
    const names = (await api.get("/api/suppliers")).body.map((s: { name: string }) => s.name);
    for (const text of PAYLOADS) expect(names).toContain(text);
  });

  it("refuses hostile text in ids, paths, query strings and typed fields, never with a 500", async () => {
    const bad = encodeURIComponent("1; drop table project; --");
    const quote = encodeURIComponent("' or 1=1 --");
    const answers = [
      await api.get(`/api/funds?phase=${encodeURIComponent("estimate'; select 1;--")}`),
      await api.patch(`/api/lines/${bad}`, { version: 1 }),
      await api.del(`/api/projects/${bad}`),
      await api.get(`/api/areas/${quote}/sheet`),
      await api.get(`/api/views/vat-report?area=${quote}`),
      await api.get(`/api/views/items?categories=${quote}&priority=${encodeURIComponent("High'; --")}`),
      await api.get(`/api/views/items?sort=${encodeURIComponent("1; drop table fund")}`),
      await api.get(`/api/audit?table=${quote}`),
      await api.get(`/api/audit?rowId=${bad}&limit=${bad}`),
      await api.post("/api/inflows", { phase: "actual", sourceName: "x", amount: "10; drop table fund" }),
      await api.post("/api/inflows", { phase: "estimate'; --", sourceName: "x", amount: "1" }),
      await api.put("/api/funds/1/contracts/estimate", { amount: "1", inflowDate: "2026-01-01'; --" }),
      await api.put("/api/bank", { amount: "1", asOfDate: "' or 1=1" }),
      await api.patch("/api/users/1", { role: "admin'; --" }),
      await api.patch("/api/users/1", { areaIds: ["1; drop table app_user"] }),
      await api.anonymous().get(`/api/auth/callback?code=${encodeURIComponent("'; drop table app_user; --")}&state=${quote}`),
    ];
    expect(answers.filter((a) => a.status >= 500)).toEqual([]);
    expect(await tablesLeft()).toBe(8);
  });

  it("ignores fields that are not part of the input (no mass assignment)", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, { item: "A" })).body;
    const changed = await api.patch(`/api/lines/${line.id}`, { version: 1, item: "B", projectId: 999, id: 12345 });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ id: line.id, projectId: project.id, item: "B" });
  });
});

describe("what every answer carries", () => {
  it("sends security headers and forbids caching", async () => {
    const reply = await api.anonymous().get("/api/health");
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    expect(reply.headers["x-frame-options"]).toBeDefined();
    expect(reply.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(reply.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["x-powered-by"]).toBeUndefined();
  });

  it("keeps the budget out of caches even when the answer is an error", async () => {
    const reply = await api.anonymous().get("/api/areas");
    expect(reply.status).toBe(401);
    expect(reply.headers["cache-control"]).toBe("no-store");
  });
});

describe("the request limit", () => {
  const limits = { api: 6, signIn: 2 };
  const from = (app: ReturnType<typeof testApp>["app"], remoteAddress: string, url: string, headers = {}) =>
    app.inject({ method: "GET", url, remoteAddress, headers }).then((r) => r.statusCode);

  it("stops an address that asks too often, and says when to come back", async () => {
    const limited = testApp({ rateLimits: limits });
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push(await from(limited.app, "10.0.0.1", "/api/auth/config"));
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);

    const reply = await limited.app.inject({ method: "GET", url: "/api/auth/config", remoteAddress: "10.0.0.1" });
    expect(reply.json().error).toMatch(/too many requests/i);
    expect(Number(reply.headers["retry-after"])).toBeGreaterThan(0);
    await limited.app.close();
  });

  it("counts every address on its own", async () => {
    const limited = testApp({ rateLimits: limits });
    for (let i = 0; i < 6; i++) await from(limited.app, "10.0.0.1", "/api/auth/config");
    expect(await from(limited.app, "10.0.0.1", "/api/auth/config")).toBe(429);
    expect(await from(limited.app, "10.0.0.2", "/api/auth/config")).toBe(200);
    await limited.app.close();
  });

  it("is much stricter on the sign-in routes, which do not use up the rest of the allowance", async () => {
    const limited = testApp({ rateLimits: limits });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push(await from(limited.app, "10.0.0.1", "/api/auth/login"));
    expect(statuses).toEqual([503, 503, 429, 429]); // 503: Google is not configured in tests
    expect(await from(limited.app, "10.0.0.1", "/api/auth/callback")).toBe(429); // same sign-in allowance
    expect(await from(limited.app, "10.0.0.1", "/api/auth/config")).toBe(200);
    await limited.app.close();
  });

  it("never limits the health check", async () => {
    const limited = testApp({ rateLimits: limits });
    const statuses = new Set<number>();
    for (let i = 0; i < 15; i++) statuses.add(await from(limited.app, "10.0.0.1", "/api/health"));
    expect([...statuses]).toEqual([200]);
    await limited.app.close();
  });

  it("cannot be dodged with a made-up X-Forwarded-For unless a proxy is trusted", async () => {
    const direct = testApp({ rateLimits: limits });
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push(await from(direct.app, "10.0.0.1", "/api/auth/config", { "x-forwarded-for": `1.2.3.${i}` }));
    expect(statuses.at(-1)).toBe(429);
    await direct.app.close();

    const proxied = testApp({ rateLimits: limits, trustProxy: true });
    const answers = new Set<number>();
    for (let i = 0; i < 7; i++) answers.add(await from(proxied.app, "10.0.0.1", "/api/auth/config", { "x-forwarded-for": `1.2.3.${i}` }));
    expect([...answers]).toEqual([200]); // seven different clients behind the proxy
    await proxied.app.close();
  });
});
