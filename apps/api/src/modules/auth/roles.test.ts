import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, testApp } from "../../../test/helpers";

// Who may do what, checked through the real routes. The admin sets the scene; the others try.
const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };
const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] }; // project manager of "sw" only
const pmWithoutAreas: Person = { email: "pm-none@team.test", role: "pm" };

/** One project and one line in the area `sw` and in the area `mt-dmt`, a fund with a contract, an inflow, a supplier. */
async function scene() {
  const mine = (await api.post("/api/projects", { areaCode: "sw", name: "Mine" })).body;
  const other = (await api.post("/api/projects", { areaCode: "mt-dmt", name: "Other" })).body;
  const myLine = (await api.post(`/api/projects/${mine.id}/lines`, { item: "My item" })).body;
  const otherLine = (await api.post(`/api/projects/${other.id}/lines`, { item: "Other item" })).body;
  const contract = (await api.post("/api/funds/contracts", { phase: "estimate", fundName: "Sponsor", amount: "100" })).body;
  const inflow = (await api.post("/api/inflows", { phase: "estimate", sourceName: "Donation", amount: "10" })).body;
  const supplier = (await api.post("/api/suppliers", { name: "Acme" })).body;
  return { mine, other, myLine, otherLine, contract, inflow, supplier };
}

describe("reading", () => {
  it("is open to every signed-in role", async () => {
    await scene();
    for (const person of [viewer, pm, pmWithoutAreas]) {
      const as = api.as(person);
      for (const url of ["/api/areas", "/api/areas/sw/sheet", "/api/funds", "/api/suppliers", "/api/bank", "/api/me"]) {
        expect([url, (await as.get(url)).status]).toEqual([url, 200]);
      }
    }
  });
});

describe("viewer", () => {
  it("cannot change anything", async () => {
    const s = await scene();
    const as = api.as(viewer);
    const attempts = [
      await as.post("/api/projects", { areaCode: "sw", name: "X" }),
      await as.patch(`/api/projects/${s.mine.id}`, { name: "X" }),
      await as.del(`/api/projects/${s.mine.id}`),
      await as.post(`/api/projects/${s.mine.id}/lines`, { item: "X" }),
      await as.patch(`/api/lines/${s.myLine.id}`, { version: 1, item: "X" }),
      await as.del(`/api/lines/${s.myLine.id}`),
      await as.post("/api/funds/contracts", { phase: "estimate", fundName: "X", amount: "1" }),
      await as.patch(`/api/funds/${s.contract.fundId}`, { paysVatActual: true }),
      await as.del(`/api/funds/contracts/${s.contract.id}`),
      await as.post("/api/inflows", { phase: "estimate", sourceName: "X", amount: "1" }),
      await as.del(`/api/inflows/${s.inflow.id}`),
      await as.put("/api/bank", { amount: "1" }),
      await as.del("/api/bank"),
      await as.post("/api/suppliers", { name: "X" }),
      await as.del(`/api/suppliers/${s.supplier.id}`),
    ];
    expect(attempts.map((r) => r.status)).toEqual(attempts.map(() => 403));
  });

  it("cannot read the history or the users", async () => {
    expect((await api.as(viewer).get("/api/audit")).status).toBe(403);
    expect((await api.as(viewer).get("/api/users")).status).toBe(403);
  });
});

describe("pm", () => {
  it("changes the projects and lines of their own area", async () => {
    const as = api.as(pm);
    const project = await as.post("/api/projects", { areaCode: "sw", name: "New" });
    expect(project.status).toBe(201);
    const line = await as.post(`/api/projects/${project.body.id}/lines`, { item: "Thing" });
    expect(line.status).toBe(201);
    expect((await as.patch(`/api/lines/${line.body.id}`, { version: 1, item: "Thing 2" })).status).toBe(200);
    expect((await as.patch(`/api/projects/${project.body.id}`, { name: "Renamed" })).status).toBe(200);
    expect((await as.del(`/api/lines/${line.body.id}`)).status).toBe(204);
    expect((await as.del(`/api/projects/${project.body.id}`)).status).toBe(204);
  });

  it("cannot touch another area", async () => {
    const s = await scene();
    const as = api.as(pm);
    const attempts = [
      await as.post("/api/projects", { areaCode: "mt-dmt", name: "X" }),
      await as.patch(`/api/projects/${s.other.id}`, { name: "X" }),
      await as.del(`/api/projects/${s.other.id}`),
      await as.post(`/api/projects/${s.other.id}/lines`, { item: "X" }),
      await as.patch(`/api/lines/${s.otherLine.id}`, { version: 1, item: "X" }),
      await as.del(`/api/lines/${s.otherLine.id}`),
    ];
    expect(attempts.map((r) => r.status)).toEqual(attempts.map(() => 403));
    // ...and nothing changed
    expect((await api.get("/api/areas/mt-dmt/sheet")).body.projects[0]).toMatchObject({ name: "Other" });
  });

  it("cannot touch the shared data: funds, contracts, inflows, BANK", async () => {
    const s = await scene();
    const as = api.as(pm);
    const attempts = [
      await as.post("/api/funds/contracts", { phase: "estimate", fundName: "X", amount: "1" }),
      await as.patch(`/api/funds/${s.contract.fundId}`, { paysVatEstimate: true }),
      await as.del(`/api/funds/contracts/${s.contract.id}`),
      await as.del(`/api/funds/${s.contract.fundId}`),
      await as.post("/api/inflows", { phase: "estimate", sourceName: "X", amount: "1" }),
      await as.del(`/api/inflows/${s.inflow.id}`),
      await as.put("/api/bank", { amount: "1" }),
      await as.del("/api/bank"),
    ];
    expect(attempts.map((r) => r.status)).toEqual(attempts.map(() => 403));
  });

  it("can add and remove suppliers", async () => {
    const created = await api.as(pm).post("/api/suppliers", { name: "New supplier" });
    expect(created.status).toBe(201);
    expect((await api.as(pm).del(`/api/suppliers/${created.body.id}`)).status).toBe(204);
  });

  it("without assigned areas can change no area, only the suppliers", async () => {
    await scene();
    const as = api.as(pmWithoutAreas);
    expect((await as.post("/api/projects", { areaCode: "sw", name: "X" })).status).toBe(403);
    expect((await as.post("/api/suppliers", { name: "Z" })).status).toBe(201);
  });

  it("can read the history", async () => {
    expect((await api.as(pm).get("/api/audit")).status).toBe(200);
  });
});

describe("admin", () => {
  it("can do everything, in every area", async () => {
    const s = await scene();
    expect((await api.patch(`/api/lines/${s.otherLine.id}`, { version: 1, item: "Changed" })).status).toBe(200);
    expect((await api.put("/api/bank", { amount: "5" })).status).toBe(200);
    expect((await api.get("/api/users")).status).toBe(200);
    expect((await api.get("/api/audit")).status).toBe(200);
  });
});
