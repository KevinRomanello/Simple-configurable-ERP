import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, resetData, testApp } from "../test/helpers";
import { db } from "./db/client";
import { appUser } from "./db/schema";

// Input that is too big, too strange or too simultaneous must be answered with a clear 400 / 409
// (or work), never with a 500 and never with a wrong result.

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

async function lineIn(areaCode = "sw") {
  const project = (await api.post("/api/projects", { areaCode, name: "P" })).body;
  const line = (await api.post(`/api/projects/${project.id}/lines`, { item: "A" })).body;
  return { project, line };
}

describe("numbers that are too big", () => {
  it("refuses a contract, an inflow, the BANK and a sponsor above the limits, with a 400", async () => {
    const answers = [
      await api.post("/api/funds/contracts", { phase: "estimate", fundName: "F", amount: "9999999999999.99" }),
      await api.post("/api/funds/contracts", { phase: "estimate", fundName: "F", amount: "1000000000.01" }),
      await api.post("/api/inflows", { phase: "estimate", sourceName: "F", amount: "9999999999999.99" }),
      await api.put("/api/bank", { amount: "9999999999999.99" }),
      await api.put("/api/bank", { amount: "99999999999999999999" }),
    ];
    expect(answers.map((a) => a.status)).toEqual([400, 400, 400, 400, 400]);
    expect((await api.post("/api/funds/contracts", { phase: "estimate", fundName: "F", amount: "1000000000" })).status).toBe(201);
  });

  it("refuses quantity and unit cost above their limits, and a net cost above 100,000,000", async () => {
    const { line } = await lineIn();
    const patch = (figures: object, version: number) => api.patch(`/api/lines/${line.id}`, { version, figures: { estimate: figures } });

    expect((await patch({ quantity: "100000000000" }, 1)).status).toBe(400);
    expect((await patch({ quantity: "1000000.001" }, 1)).status).toBe(400);
    expect((await patch({ unitNetCost: "10000000000" }, 1)).status).toBe(400);
    expect((await patch({ unitNetCost: "10000000.0001" }, 1)).status).toBe(400);

    // each one alone is fine; together they make 10^12 euros
    expect((await patch({ quantity: "1000000" }, 1)).status).toBe(200);
    const tooMuch = await patch({ unitNetCost: "1000000" }, 2);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toMatch(/net cost of a line/);

    // right at the limit still works, and is added up exactly
    expect((await patch({ unitNetCost: "100", sponsorType: "none", vatRate: 22 }, 2)).status).toBe(200);
    const sheet = (await api.get("/api/areas/sw/sheet")).body;
    expect(sheet.total.estimate).toMatchObject({ netCents: 10_000_000_000, vatCents: 2_200_000_000 });
  });

  it("refuses a version that does not fit the database", async () => {
    const { line } = await lineIn();
    expect((await api.patch(`/api/lines/${line.id}`, { version: 99999999999, item: "x" })).status).toBe(400);
  });
});

describe("ids", () => {
  it("answers 400 for ids no database row can have, on every route that takes one", async () => {
    const huge = "2147483648";
    const answers = [
      await api.patch(`/api/lines/${huge}`, { version: 1 }),
      await api.del(`/api/lines/${huge}`),
      await api.post(`/api/projects/${huge}/lines`, { item: "x" }),
      await api.patch(`/api/projects/${huge}`, { name: "x" }),
      await api.del(`/api/projects/${huge}`),
      await api.del(`/api/funds/contracts/${huge}`),
      await api.patch(`/api/funds/${huge}`, { paysVatActual: true }),
      await api.del(`/api/funds/${huge}`),
      await api.del(`/api/inflows/${huge}`),
      await api.del(`/api/suppliers/${huge}`),
      await api.patch(`/api/users/${huge}`, { role: "pm" }),
      await api.patch("/api/users/1", { areaIds: [2147483648] }),
      await api.get(`/api/audit?rowId=${huge}`),
      await api.get(`/api/audit?actorId=${huge}`),
    ];
    expect(answers.map((a) => a.status)).toEqual(answers.map(() => 400));
  });

  it("refuses ids written in a way Number() would still understand", async () => {
    for (const bad of ["0x10", "1e3", "1.5", "-1", "%201", "007x"]) {
      expect([bad, (await api.del(`/api/lines/${bad}`)).status]).toEqual([bad, 400]);
    }
    expect((await api.del("/api/lines/999999")).status).toBe(404); // a plain unknown id is still a 404
  });
});

describe("text", () => {
  it("refuses the NUL character, which the database cannot store, everywhere text is typed", async () => {
    const nul = "a\u0000b";
    const { project, line } = await lineIn();
    const answers = [
      await api.post("/api/suppliers", { name: nul }),
      await api.post("/api/projects", { areaCode: "sw", name: nul }),
      await api.post("/api/projects", { areaCode: nul, name: "x" }),
      await api.patch(`/api/projects/${project.id}`, { ownerName: nul }),
      await api.post(`/api/projects/${project.id}/lines`, { item: nul }),
      await api.patch(`/api/lines/${line.id}`, { version: 1, note: nul }),
      await api.patch(`/api/lines/${line.id}`, { version: 1, category: nul }),
      await api.post("/api/funds/contracts", { phase: "estimate", fundName: nul, amount: "1" }),
      await api.post("/api/inflows", { phase: "estimate", sourceName: nul, amount: "1" }),
      await api.get(`/api/audit?table=${encodeURIComponent(nul)}`),
      await api.get(`/api/views/vat-report?area=${encodeURIComponent(nul)}`),
      await api.get(`/api/areas/${encodeURIComponent(nul)}/sheet`),
    ];
    expect(answers.map((a) => a.status)).toEqual(answers.map(() => 400));
  });

  it("refuses names that are too long, even when they would be too big for an index", async () => {
    for (const length of [201, 3000, 50_000]) {
      const text = randomBytes(length).toString("base64").slice(0, length);
      const answers = [
        await api.post("/api/suppliers", { name: text }),
        await api.post("/api/funds/contracts", { phase: "estimate", fundName: text, amount: "1" }),
        await api.post("/api/inflows", { phase: "estimate", sourceName: text, amount: "1" }),
        await api.post("/api/projects", { areaCode: "sw", name: text }),
      ];
      expect([length, answers.map((a) => a.status)]).toEqual([length, [400, 400, 400, 400]]);
    }
  });

  it("keeps ordinary text as it is: accents, emoji, line breaks, long notes", async () => {
    const { line } = await lineIn();
    const note = "caffè ☕ 😀\nsecond line " + "x".repeat(4_000);
    expect((await api.patch(`/api/lines/${line.id}`, { version: 1, note })).body.note).toBe(note);
    expect((await api.post("/api/suppliers", { name: "Caffè 日本語 😀" })).body.name).toBe("Caffè 日本語 😀");
  });
});

describe("dates", () => {
  it("accepts only real days between 2000 and 2100", async () => {
    const date = (d: string) => api.post("/api/funds/contracts", { phase: "estimate", fundName: `F ${d}`, amount: "1", inflowDate: d });
    for (const bad of ["0000-01-01", "0001-01-01", "1999-12-31", "2101-01-01", "9999-12-31", "10000-01-01", "2026-02-30"]) {
      expect([bad, (await date(bad)).status]).toEqual([bad, 400]);
    }
    for (const good of ["2000-01-01", "2024-02-29", "2100-12-31"]) expect([good, (await date(good)).status]).toEqual([good, 201]);
  });

  it("keeps the views small: no date can stretch a timeline over thousands of years", async () => {
    await api.post("/api/funds/contracts", { phase: "estimate", fundName: "Old", amount: "1", inflowDate: "0001-01-01" });
    await api.post("/api/funds/contracts", { phase: "estimate", fundName: "Far", amount: "1", inflowDate: "9999-12-31" });
    const summary = await api.get("/api/views/funds-summary?phase=estimate");
    expect(summary.status).toBe(200);
    expect(JSON.stringify(summary.body).length).toBeLessThan(5_000);
  });
});

describe("requests at the same moment", () => {
  it("gives every line added at once its own position, in the order they were stored", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    const answers = await Promise.all(Array.from({ length: 15 }, (_, i) => api.post(`/api/projects/${project.id}/lines`, { item: `L${i}` })));
    expect(answers.map((a) => a.status)).toEqual(answers.map(() => 201));
    const lines = (await api.get("/api/areas/sw/sheet")).body.projects[0].lines;
    expect(lines.map((l: { position: number }) => l.position)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("does the same for projects", async () => {
    const answers = await Promise.all(Array.from({ length: 10 }, (_, i) => api.post("/api/projects", { areaCode: "hw", name: `Q${i}` })));
    expect(answers.map((a) => a.status)).toEqual(answers.map(() => 201));
    const positions = answers.map((a) => a.body.position).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  it("lets one of many edits of the same version win and tells the others to reload", async () => {
    const { line } = await lineIn();
    const answers = await Promise.all(Array.from({ length: 20 }, (_, i) => api.patch(`/api/lines/${line.id}`, { version: 1, note: `n${i}` })));
    const statuses = answers.map((a) => a.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
  });

  it("adds every contract to the one fund of a new name, when the same name is used at once", async () => {
    const answers = await Promise.all(Array.from({ length: 12 }, () => api.post("/api/funds/contracts", { phase: "estimate", fundName: "NewFund", amount: "1" })));
    expect(answers.map((a) => a.status)).toEqual(answers.map(() => 201));
    const funds = (await api.get("/api/funds")).body.filter((f: { name: string }) => f.name === "NewFund");
    expect(funds).toHaveLength(1);
    expect((await api.get("/api/funds/contracts?phase=estimate")).body).toHaveLength(12);
  });

  it("answers 409 to all but one of many equal suppliers", async () => {
    const answers = await Promise.all(Array.from({ length: 10 }, () => api.post("/api/suppliers", { name: "Same" })));
    expect(answers.filter((a) => a.status === 201)).toHaveLength(1);
    expect(answers.filter((a) => a.status === 409)).toHaveLength(9);
  });

  it("never leaves the system without an admin when two admins step down at once", async () => {
    const a = await createUser({ email: "race-a@team.test", role: "admin" });
    const b = await createUser({ email: "race-b@team.test", role: "admin" });
    // they are the only two active admins
    await db.update(appUser).set({ role: "viewer" }).where(and(eq(appUser.role, "admin"), sql`${appUser.id} not in (${a.id}, ${b.id})`));

    const asA = api.as({ email: "race-a@team.test", role: "admin" });
    const asB = api.as({ email: "race-b@team.test", role: "admin" });
    const answers = await Promise.all([asA.patch(`/api/users/${b.id}`, { role: "viewer" }), asB.patch(`/api/users/${a.id}`, { role: "viewer" })]);

    expect(answers.map((r) => r.status).sort()).toEqual([200, 409]);
    const admins = await db.select().from(appUser).where(and(eq(appUser.role, "admin"), eq(appUser.active, true)));
    expect(admins).toHaveLength(1);
    await createUser({ email: "admin@team.test", role: "admin" }); // the default test admin was one of those demoted
  });
});
