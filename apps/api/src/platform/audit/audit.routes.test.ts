import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addContract, createUser, resetData, sponsorId, testApp } from "../../../test/helpers";
import { db } from "../../db/client";
import { appUser, auditLog, supplier } from "../../db/schema";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const history = async (query = "") => (await api.get(`/api/audit${query}`)).body as {
  entries: any[];
  next: number | null;
};
const adminId = async () => (await api.get("/api/me")).body.id as number;

describe("what is recorded", () => {
  it("records an insert with who did it and the new row", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "Steering" })).body;
    const [entry] = (await history("?table=project")).entries;
    expect(entry).toMatchObject({
      table: "project",
      rowId: project.id,
      action: "insert",
      label: "Steering",
      actor: { id: await adminId(), email: "admin@team.test" },
    });
    expect(entry.changes.find((c: any) => c.field === "name")).toEqual({ field: "name", before: null, after: "Steering" });
  });

  it("records an update as only the fields that changed, without the version noise", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, { item: "Sensor" })).body;
    await api.patch(`/api/lines/${line.id}`, { version: 1, item: "Sensor 2", note: "hi" });

    const update = (await history("?table=budget_line")).entries.find((e) => e.action === "update");
    expect(update.label).toBe("Sensor 2");
    expect(update.changes).toEqual(
      expect.arrayContaining([
        { field: "item", before: "Sensor", after: "Sensor 2" },
        { field: "note", before: null, after: "hi" },
      ]),
    );
    expect(update.changes.map((c: any) => c.field)).not.toContain("version");
  });

  it("records the figures of a line, with their phase", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 2, unitNetCost: "10" } },
    })).body;
    const [entry] = (await history("?table=line_figures")).entries;
    expect(entry).toMatchObject({ action: "insert", label: `figures (estimate) of line ${line.id}` });
    expect(entry.changes.find((c: any) => c.field === "quantity")?.after).toBe(2); // the history is read as JSON: numbers, not exact strings
  });

  it("records the rows deleted in cascade", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 1, unitNetCost: "1" } },
    })).body;
    await api.del(`/api/projects/${project.id}`);

    const deletes = (await history()).entries.filter((e) => e.action === "delete");
    expect(deletes.map((e) => e.table).sort()).toEqual(["budget_line", "line_figures", "project"]);
    expect(deletes.find((e) => e.table === "budget_line")).toMatchObject({ rowId: line.id, label: "A" });
    expect(deletes.every((e) => e.actor?.email === "admin@team.test")).toBe(true);
  });

  it("records funds, the funds of a line, contracts, inflows, BANK and suppliers", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 1, unitNetCost: "1", fundIds: [await sponsorId(api, "Sponsor")] } },
    });
    await addContract(api, { fundName: "Sponsor", amount: "100" });
    await api.post("/api/inflows", { phase: "actual", sourceName: "Donation", amount: "5" });
    await api.put("/api/bank", { amount: "7", asOfDate: "2026-12-01" });
    await api.post("/api/suppliers", { name: "Acme" });
    const tables = new Set((await history()).entries.map((e) => e.table));
    for (const table of ["fund", "line_fund", "fund_contract", "team_inflow", "bank_snapshot", "supplier"]) {
      expect(tables).toContain(table);
    }
  });

  it("records changes to users, with the admin who made them", async () => {
    const person = await createUser({ email: "someone@team.test", role: "viewer" });
    await api.patch(`/api/users/${person.id}`, { role: "pm" });
    const entry = (await history(`?table=app_user&rowId=${person.id}`)).entries.find((e) => e.action === "update");
    expect(entry).toMatchObject({ label: "someone@team.test", actor: { email: "admin@team.test" } });
    expect(entry.changes).toEqual([{ field: "role", before: "viewer", after: "pm" }]);
  });

  it("leaves no trace of a request that failed", async () => {
    await api.post("/api/suppliers", { name: "Acme" });
    expect((await api.post("/api/suppliers", { name: "ACME" })).status).toBe(409);
    expect((await history("?table=supplier")).entries).toHaveLength(1);
  });

  it("shows no actor for changes made outside a signed-in request (seed, importer)", async () => {
    const [row] = await db.insert(supplier).values({ name: "From the importer" }).returning();
    const [entry] = (await history(`?table=supplier&rowId=${row!.id}`)).entries;
    expect(entry.actor).toBeNull();
  });

  it("does not write anything when somebody just signs in again", async () => {
    const before = (await db.select().from(auditLog)).length;
    await api.get("/api/me");
    await api.get("/api/areas/sw/sheet");
    expect((await db.select().from(auditLog)).length).toBe(before);
  });
});

describe("reading the history", () => {
  it("is for admins and project managers, not for viewers", async () => {
    expect((await api.as({ email: "pm@team.test", role: "pm" }).get("/api/audit")).status).toBe(200);
    expect((await api.as({ email: "viewer@team.test", role: "viewer" }).get("/api/audit")).status).toBe(403);
    expect((await api.anonymous().get("/api/audit")).status).toBe(401);
  });

  it("starts with the most recent change", async () => {
    await api.post("/api/suppliers", { name: "First" });
    await api.post("/api/suppliers", { name: "Second" });
    expect((await history("?table=supplier")).entries.map((e) => e.label)).toEqual(["Second", "First"]);
  });

  it("filters by table, row and person", async () => {
    const pm = { email: "pm@team.test", role: "pm" as const, areas: ["sw"] };
    const mine = (await api.as(pm).post("/api/projects", { areaCode: "sw", name: "By pm" })).body;
    await api.post("/api/projects", { areaCode: "mt-dmt", name: "By admin" });

    expect((await history(`?table=project&rowId=${mine.id}`)).entries).toHaveLength(1);
    const pmId = (await createUser(pm)).id;
    const byPm = (await history(`?actorId=${pmId}`)).entries;
    expect(byPm.length).toBeGreaterThan(0);
    expect(byPm.every((e) => e.actor.id === pmId)).toBe(true);
    expect((await history("?table=nothing")).entries).toEqual([]);
  });

  it("reads page by page", async () => {
    for (const name of ["A", "B", "C", "D", "E"]) await api.post("/api/suppliers", { name });
    const first = await history("?table=supplier&limit=2");
    expect(first.entries.map((e) => e.label)).toEqual(["E", "D"]);
    expect(first.next).not.toBeNull();

    const second = await history(`?table=supplier&limit=2&before=${first.next}`);
    expect(second.entries.map((e) => e.label)).toEqual(["C", "B"]);

    const last = await history(`?table=supplier&limit=2&before=${second.next}`);
    expect(last.entries.map((e) => e.label)).toEqual(["A"]);
    expect(last.next).toBeNull();
  });

  it("rejects a silly page size", async () => {
    expect((await api.get("/api/audit?limit=0")).status).toBe(400);
    expect((await api.get("/api/audit?limit=100000")).status).toBe(400);
  });

  it("keeps the entries of a person who was deactivated", async () => {
    const pm = { email: "pm@team.test", role: "pm" as const, areas: ["sw"] };
    await api.as(pm).post("/api/projects", { areaCode: "sw", name: "Before leaving" });
    const id = (await createUser(pm)).id;
    await db.update(appUser).set({ active: false }).where(eq(appUser.id, id));
    expect((await history("?table=project")).entries[0].actor.email).toBe("pm@team.test");
  });
});
