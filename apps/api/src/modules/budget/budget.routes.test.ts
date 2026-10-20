import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

async function project(name = "Steering", areaCode = "mt-dmt") {
  return (await api.post("/api/projects", { areaCode, name })).body;
}
async function sheet(areaCode = "mt-dmt") {
  return (await api.get(`/api/areas/${areaCode}/sheet`)).body;
}

describe("projects", () => {
  it("adds projects at the end of an area, with their owner", async () => {
    const first = await api.post("/api/projects", { areaCode: "mt-dmt", name: "Steering", ownerName: "Someone" });
    expect(first.status).toBe(201);
    await project("Brakes");
    const { projects } = await sheet();
    expect(projects.map((p: any) => [p.name, p.ownerName])).toEqual([["Steering", "Someone"], ["Brakes", null]]);
  });

  it("renames, changes the owner and deletes with all the lines", async () => {
    const created = await project();
    await api.post(`/api/projects/${created.id}/lines`, { item: "Sensor" });
    const patched = await api.patch(`/api/projects/${created.id}`, { name: "Steering 2", ownerName: "Ann" });
    expect(patched.body).toMatchObject({ name: "Steering 2", ownerName: "Ann" });
    expect((await api.del(`/api/projects/${created.id}`)).status).toBe(204);
    expect((await sheet()).projects).toEqual([]);
  });

  it("rejects an unknown area and an empty name", async () => {
    expect((await api.post("/api/projects", { areaCode: "nope", name: "X" })).status).toBe(404);
    expect((await api.post("/api/projects", { areaCode: "sw", name: "  " })).status).toBe(400);
    expect((await api.patch("/api/projects/9999", { name: "X" })).status).toBe(404);
  });
});

describe("lines", () => {
  it("creates a line with figures and shows the computed amounts", async () => {
    const { id } = await project();
    const created = await api.post(`/api/projects/${id}/lines`, {
      item: "Torquemeter",
      category: "Asset",
      priority: "High",
      figures: { estimate: { quantity: 10, unitNetCost: "100", sponsorType: "none", vatRate: 22 } },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ item: "Torquemeter", version: 1, position: 1 });

    const [line] = (await sheet()).projects[0].lines;
    expect(line.estimate.amounts).toMatchObject({ netCents: 100_000, vatCents: 22_000, grossCents: 122_000, outflowCents: 122_000 });
    expect(line.actual.amounts.outflowCents).toBe(0);
  });

  it("subtotals the project and the area", async () => {
    const { id } = await project();
    const figures = { estimate: { quantity: 1, unitNetCost: "50", sponsorType: "none", vatRate: 0 } };
    await api.post(`/api/projects/${id}/lines`, { item: "A", figures });
    await api.post(`/api/projects/${id}/lines`, { item: "B", figures });
    const result = await sheet();
    expect(result.projects[0].subtotal.estimate.netCents).toBe(10_000);
    expect(result.total.estimate.outflowCents).toBe(10_000);
  });

  it("updates fields and bumps the version", async () => {
    const { id } = await project();
    const line = (await api.post(`/api/projects/${id}/lines`, { item: "A" })).body;
    const updated = await api.patch(`/api/lines/${line.id}`, {
      version: 1,
      item: "A2",
      note: "hello",
      figures: { actual: { quantity: "2", unitNetCost: "10.5", sponsorType: "none", vatRate: 11, purchaseDate: "2026-11-20" } },
    });
    expect(updated.body).toMatchObject({ item: "A2", note: "hello", version: 2 });
    const [fromSheet] = (await sheet()).projects[0].lines;
    expect(fromSheet.actual).toMatchObject({ purchaseDate: "2026-11-20" });
    expect(fromSheet.actual.amounts.netCents).toBe(2_100);
  });

  it("merges a partial change into existing figures and lets null clear a field", async () => {
    const { id } = await project();
    const line = (await api.post(`/api/projects/${id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 3, unitNetCost: "10", sponsorType: "none", vatRate: 22, purchaseDate: "2026-11-20" } },
    })).body;
    await api.patch(`/api/lines/${line.id}`, { version: 1, figures: { estimate: { quantity: 4, purchaseDate: null } } });
    const [fromSheet] = (await sheet()).projects[0].lines;
    expect(fromSheet.estimate.amounts.netCents).toBe(4_000); // new quantity, unit cost kept
    expect(fromSheet.estimate.purchaseDate).toBeNull();
  });

  it("refuses a write made on an outdated version (409) and keeps the other person's change", async () => {
    const { id } = await project();
    const line = (await api.post(`/api/projects/${id}/lines`, { item: "A" })).body;
    expect((await api.patch(`/api/lines/${line.id}`, { version: 1, item: "first" })).status).toBe(200);
    const stale = await api.patch(`/api/lines/${line.id}`, { version: 1, item: "second" });
    expect(stale.status).toBe(409);
    expect((await sheet()).projects[0].lines[0].item).toBe("first");
  });

  it("deletes a line; unknown lines are 404", async () => {
    const { id } = await project();
    const line = (await api.post(`/api/projects/${id}/lines`, { item: "A" })).body;
    expect((await api.del(`/api/lines/${line.id}`)).status).toBe(204);
    expect((await api.del(`/api/lines/${line.id}`)).status).toBe(404);
    expect((await api.patch("/api/lines/9999", { version: 1, item: "x" })).status).toBe(404);
  });
});

describe("validation", () => {
  async function newLine() {
    const { id } = await project();
    return (await api.post(`/api/projects/${id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 10, unitNetCost: "100", sponsorType: "none", vatRate: 22 } },
    })).body;
  }
  const patch = async (lineId: number, figures: object, extra: object = {}) =>
    api.patch(`/api/lines/${lineId}`, { version: 1, figures: { estimate: figures }, ...extra });

  it("only accepts known categories and VAT rates", async () => {
    const { id } = await project();
    expect((await api.post(`/api/projects/${id}/lines`, { item: "A", category: "Nonsense" })).status).toBe(400);
    const line = await newLine();
    expect((await patch(line.id, { vatRate: 15 })).status).toBe(400);
    expect((await patch(line.id, { vatRate: 11 })).status).toBe(200);
  });

  it("rejects negative numbers, too many decimals and impossible dates", async () => {
    const line = await newLine();
    expect((await patch(line.id, { quantity: -1 })).status).toBe(400);
    expect((await patch(line.id, { unitNetCost: "1.23456" })).status).toBe(400);
    expect((await patch(line.id, { purchaseDate: "2026-02-30" })).status).toBe(400);
    expect((await patch(line.id, { purchaseDate: "20/11/2026" })).status).toBe(400);
  });

  it("keeps a partial sponsor above zero and within the net cost", async () => {
    const line = await newLine(); // net 1000.00
    expect((await patch(line.id, { sponsorType: "partial", sponsorValue: "1000.01" })).status).toBe(400);
    expect((await patch(line.id, { sponsorType: "partial", sponsorValue: "0" })).status).toBe(400);
    expect((await patch(line.id, { sponsorType: "partial", sponsorValue: "400" })).status).toBe(200);
    const [fromSheet] = (await sheet()).projects[0].lines;
    expect(fromSheet.estimate.amounts).toMatchObject({ sponsorCents: 40_000, vatCents: 13_200, outflowCents: 73_200 });
  });

  it("forgets the typed sponsor value when the type stops being partial", async () => {
    const line = await newLine();
    await patch(line.id, { sponsorType: "partial", sponsorValue: "400" });
    await api.patch(`/api/lines/${line.id}`, { version: 2, figures: { estimate: { sponsorType: "total" } } });
    const [fromSheet] = (await sheet()).projects[0].lines;
    expect(fromSheet.estimate.amounts.sponsorCents).toBe(100_000); // the whole net, not 400
  });

  it("re-checks the sponsor when quantity or cost change", async () => {
    const line = await newLine();
    await patch(line.id, { sponsorType: "partial", sponsorValue: "900" });
    expect((await api.patch(`/api/lines/${line.id}`, { version: 2, figures: { estimate: { quantity: 1 } } })).status).toBe(400);
  });

  it("refuses a fund or supplier that does not exist", async () => {
    const line = await newLine();
    expect((await patch(line.id, { fundId: 9999 })).status).toBe(409);
  });
});
