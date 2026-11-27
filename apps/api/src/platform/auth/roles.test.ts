import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addContract, type Person, resetData, testApp } from "../../../test/helpers";

// Who may do what, checked through the real routes. The admin sets the scene; the others try.
const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };
const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] }; // project manager of "sw" only
const pmWithoutAreas: Person = { email: "pm-none@team.test", role: "pm" };

/** One project and one line in the area `sw` and in the area `mt-dmt`, a fund with a contract, an inflow, a supplier. */
async function scene() {
  const mine = (await api.post("/api/budget/projects", { areaCode: "sw", name: "Mine" })).body;
  const other = (await api.post("/api/budget/projects", { areaCode: "mt-dmt", name: "Other" })).body;
  const myLine = (await api.post(`/api/budget/projects/${mine.id}/lines`, { item: "My item" })).body;
  const otherLine = (await api.post(`/api/budget/projects/${other.id}/lines`, { item: "Other item" })).body;
  const contract = (await addContract(api, { fundName: "Sponsor", amount: "100" })).body;
  const inflow = (await api.post("/api/budget/inflows", { phase: "estimate", sourceName: "Donation", amount: "10" })).body;
  const supplier = (await api.post("/api/budget/suppliers", { name: "Acme" })).body;
  return { mine, other, myLine, otherLine, contract, inflow, supplier };
}

describe("reading", () => {
  it("is open to every signed-in role", async () => {
    await scene();
    for (const person of [viewer, pm, pmWithoutAreas]) {
      const as = api.as(person);
      for (const url of ["/api/areas", "/api/budget/areas/sw/sheet", "/api/budget/funds", "/api/budget/suppliers", "/api/budget/bank", "/api/me"]) {
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
      await as.post("/api/budget/projects", { areaCode: "sw", name: "X" }),
      await as.patch(`/api/budget/projects/${s.mine.id}`, { name: "X" }),
      await as.del(`/api/budget/projects/${s.mine.id}`),
      await as.post(`/api/budget/projects/${s.mine.id}/lines`, { item: "X" }),
      await as.patch(`/api/budget/lines/${s.myLine.id}`, { version: 1, item: "X" }),
      await as.del(`/api/budget/lines/${s.myLine.id}`),
      await as.put(`/api/budget/funds/${s.contract.fundId}/contracts/estimate`, { amount: "1" }),
      await as.post("/api/budget/funds", { name: "X", vatRate: 22 }),
      await as.patch(`/api/budget/funds/${s.contract.fundId}`, { group: "g" }),
      await as.del(`/api/budget/funds/${s.contract.fundId}/contracts/estimate`),
      await as.post("/api/budget/inflows", { phase: "estimate", sourceName: "X", amount: "1" }),
      await as.del(`/api/budget/inflows/${s.inflow.id}`),
      await as.put("/api/budget/bank", { amount: "1" }),
      await as.del("/api/budget/bank"),
      await as.post("/api/budget/suppliers", { name: "X" }),
      await as.del(`/api/budget/suppliers/${s.supplier.id}`),
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
    const project = await as.post("/api/budget/projects", { areaCode: "sw", name: "New" });
    expect(project.status).toBe(201);
    const line = await as.post(`/api/budget/projects/${project.body.id}/lines`, { item: "Thing" });
    expect(line.status).toBe(201);
    expect((await as.patch(`/api/budget/lines/${line.body.id}`, { version: 1, item: "Thing 2" })).status).toBe(200);
    expect((await as.patch(`/api/budget/projects/${project.body.id}`, { name: "Renamed" })).status).toBe(200);
    expect((await as.del(`/api/budget/lines/${line.body.id}`)).status).toBe(204);
    expect((await as.del(`/api/budget/projects/${project.body.id}`)).status).toBe(204);
  });

  it("cannot touch another area", async () => {
    const s = await scene();
    const as = api.as(pm);
    const attempts = [
      await as.post("/api/budget/projects", { areaCode: "mt-dmt", name: "X" }),
      await as.patch(`/api/budget/projects/${s.other.id}`, { name: "X" }),
      await as.del(`/api/budget/projects/${s.other.id}`),
      await as.post(`/api/budget/projects/${s.other.id}/lines`, { item: "X" }),
      await as.patch(`/api/budget/lines/${s.otherLine.id}`, { version: 1, item: "X" }),
      await as.del(`/api/budget/lines/${s.otherLine.id}`),
    ];
    expect(attempts.map((r) => r.status)).toEqual(attempts.map(() => 403));
    // ...and nothing changed
    expect((await api.get("/api/budget/areas/mt-dmt/sheet")).body.projects[0]).toMatchObject({ name: "Other" });
  });

  it("cannot touch the shared data: funds, contracts, inflows, BANK", async () => {
    const s = await scene();
    const as = api.as(pm);
    const attempts = [
      await as.put(`/api/budget/funds/${s.contract.fundId}/contracts/estimate`, { amount: "1" }),
      await as.post("/api/budget/funds", { name: "X", vatRate: 22 }),
      await as.patch(`/api/budget/funds/${s.contract.fundId}`, { group: "g" }),
      await as.del(`/api/budget/funds/${s.contract.fundId}/contracts/estimate`),
      await as.del(`/api/budget/funds/${s.contract.fundId}`),
      await as.post("/api/budget/inflows", { phase: "estimate", sourceName: "X", amount: "1" }),
      await as.del(`/api/budget/inflows/${s.inflow.id}`),
      await as.put("/api/budget/bank", { amount: "1" }),
      await as.del("/api/budget/bank"),
    ];
    expect(attempts.map((r) => r.status)).toEqual(attempts.map(() => 403));
  });

  it("can add and remove suppliers", async () => {
    const created = await api.as(pm).post("/api/budget/suppliers", { name: "New supplier" });
    expect(created.status).toBe(201);
    expect((await api.as(pm).del(`/api/budget/suppliers/${created.body.id}`)).status).toBe(204);
  });

  it("without assigned areas can change no area, only the suppliers", async () => {
    await scene();
    const as = api.as(pmWithoutAreas);
    expect((await as.post("/api/budget/projects", { areaCode: "sw", name: "X" })).status).toBe(403);
    expect((await as.post("/api/budget/suppliers", { name: "Z" })).status).toBe(201);
  });

  it("can read the history", async () => {
    expect((await api.as(pm).get("/api/audit")).status).toBe(200);
  });
});

describe("admin", () => {
  it("can do everything, in every area", async () => {
    const s = await scene();
    expect((await api.patch(`/api/budget/lines/${s.otherLine.id}`, { version: 1, item: "Changed" })).status).toBe(200);
    expect((await api.put("/api/budget/bank", { amount: "5" })).status).toBe(200);
    expect((await api.get("/api/users")).status).toBe(200);
    expect((await api.get("/api/audit")).status).toBe(200);
  });
});

describe("what the interface is told a person may do (GET /api/me)", () => {
  // The rules of the permissions, written out once: a person, their boxes, and what they may do. The boxes only count for a project manager.
  const NONE = { canEditShared: false, canManageCash: false, canChangeInflows: false, canManageSuppliers: false, canManageInventory: false, canSeeToPay: false, canGroupOrders: false, canViewHistory: false, canManageUsers: false, canManageSettings: false };
  // who keeps the budget: the suppliers, the inventory, TO PAY and its orders, the History
  const RUNS = { canManageSuppliers: true, canManageInventory: true, canSeeToPay: true, canGroupOrders: true, canViewHistory: true };
  const cases: [string, Person, object][] = [
    ["an admin", { email: "a@team.test", role: "admin" }, { canEditShared: true, canManageCash: true, canChangeInflows: true, ...RUNS, canManageUsers: true, canManageSettings: true }],
    ["a project manager", { email: "p@team.test", role: "pm" }, { ...NONE, ...RUNS }],
    ["a project manager with the treasury box", { email: "pt@team.test", role: "pm", treasury: true }, { ...NONE, ...RUNS, canManageCash: true, canChangeInflows: true }],
    ["a project manager with the sponsors box", { email: "ps@team.test", role: "pm", sponsors: true }, { ...NONE, ...RUNS, canEditShared: true, canChangeInflows: true }],
    ["a project manager with both boxes", { email: "pb@team.test", role: "pm", treasury: true, sponsors: true }, { ...NONE, ...RUNS, canEditShared: true, canManageCash: true, canChangeInflows: true }],
    ["a viewer", { email: "v@team.test", role: "viewer" }, NONE],
    ["a viewer who still has the boxes (they count for nothing)", { email: "vb@team.test", role: "viewer", treasury: true, sponsors: true }, NONE],
  ];

  it.each(cases)("%s", async (_name, person, expected) => {
    expect((await api.as(person).get("/api/me")).body.permissions).toEqual(expected);
  });
});
