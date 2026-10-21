import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, sponsorId, testApp } from "../../../test/helpers";

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
    expect((await patch(line.id, { fundIds: [9999] })).status).toBe(409);
  });
});

describe("the funds that pay a line", () => {
  /** A sponsor with a contract of `euros` in the estimate; extra settings are passed through. */
  async function fund(name: string, euros: number, extra: object = {}) {
    const fundId = await sponsorId(api, name, extra);
    if (euros > 0) await api.put(`/api/funds/${fundId}/contracts/estimate`, { amount: String(euros) });
    return fundId;
  }
  /** A line of `net` euros, paid by the funds in `fundIds`; gives back its estimate as the sheet shows it. */
  async function paid(fundIds: number[], net = 1000, projectName = "P") {
    const { id } = await project(projectName);
    const created = await api.post(`/api/projects/${id}/lines`, {
      item: "Part",
      figures: { estimate: { quantity: 1, unitNetCost: String(net), fundIds, vatRate: 22 } },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const lines = (await sheet()).projects.flatMap((p: any) => p.lines);
    return { lineId: created.body.id as number, estimate: lines.find((l: any) => l.id === created.body.id).estimate };
  }

  it("draws a line from one fund, then from the next when the first runs out", async () => {
    const a = await fund("A", 600, { group: "g" });
    const b = await fund("B", 5000, { group: "G", vatRate: 11 });
    const { estimate } = await paid([a, b], 1000);
    expect(estimate.fundName).toBe("A + B");
    expect(estimate.shares.map((s: any) => [s.fundName, s.netCents, s.vatCents])).toEqual([
      ["A", 60_000, 13_200],
      ["B", 40_000, 4_400],
    ]);
    expect(estimate.amounts.vatCents).toBe(17_600); // each part with its own sponsor's rate
    expect(estimate.shortCents).toBe(0);
  });

  it("flags the line when the funds cannot cover it, and stops when more funds are added", async () => {
    const a = await fund("A", 600, { group: "g" });
    const b = await fund("B", 100, { group: "g" });
    const { lineId, estimate } = await paid([a], 1000);
    expect(estimate.shortCents).toBe(40_000);
    const both = await api.patch(`/api/lines/${lineId}`, { version: 1, figures: { estimate: { fundIds: [a, b] } } });
    expect(both.status).toBe(200);
    const [line] = (await sheet()).projects[0].lines;
    expect(line.estimate.shortCents).toBe(30_000); // B only had 100.00 of the 400.00 left to cover
    expect(line.estimate.figures.fundIds).toEqual([a, b]);

    await api.patch(`/api/lines/${lineId}`, { version: 2, figures: { estimate: { fundIds: [] } } });
    expect((await sheet()).projects[0].lines[0].estimate.figures.fundIds).toEqual([]);
  });

  it("takes the VAT rate from the sponsor, and from the line for the team fund", async () => {
    const sponsor = await fund("S", 5000, { vatRate: 11 });
    const team = (await api.get("/api/funds")).body[0].id;
    expect((await paid([sponsor], 1000)).estimate.amounts.vatCents).toBe(11_000); // the 22% typed is ignored
    expect((await paid([team], 1000, "Q")).estimate.amounts.vatCents).toBe(22_000);
  });

  it("a gift covers the whole line; a gift with counter-invoice leaves the VAT to the team", async () => {
    const gift = await fund("Gift", 0, { type: "gift" });
    const barter = await fund("Barter", 0, { type: "gift_vat", vatRate: 11 });
    expect((await paid([gift], 1000)).estimate.amounts).toMatchObject({ sponsorCents: 100_000, vatCents: 0, outflowCents: 0 });
    const withVat = (await paid([barter], 1000, "Q")).estimate;
    expect(withVat.amounts).toMatchObject({ sponsorCents: 100_000, vatCents: 11_000, outflowCents: 11_000 });
    expect(withVat.teamVatCents).toBe(11_000);
  });

  it("refuses funds that cannot work together, with a clear reason", async () => {
    const a = await fund("A", 100, { group: "g" });
    const b = await fund("B", 100, { group: "g" });
    const other = await fund("Other", 100, { group: "h" });
    const loner = await fund("Loner", 100);
    const gift = await fund("Gift", 0, { type: "gift" });
    const cash = await fund("Cash", 100, { mode: "cash" });
    const team = (await api.get("/api/funds")).body[0].id;
    const { lineId } = await paid([]);
    const set = (fundIds: number[]) => api.patch(`/api/lines/${lineId}`, { version: 1, figures: { estimate: { fundIds } } });

    const refused = [
      await set([a, other]), // another group
      await set([a, loner]), // no group at all
      await set([loner, a]),
      await set([a, a]), // twice
      await set([team, a]), // the team fund never runs out: it can only be last
      await set([a, gift]),
      await set([gift, a]),
      await set([cash]), // its money is the team's
      await set([a, b, other]),
      await set([a, b, a, b, a]), // twice
      await set(Array.from({ length: 11 }, (_, i) => 1000 + i)), // too many
    ];
    expect(refused.map((r) => r.status)).toEqual(refused.map(() => 400));
    expect((await set([a, b, team])).status).toBe(200); // sponsors of one group, then the team
    expect((await set([9999])).status).toBe(409);
    // ...and a refused change leaves the line as it was
    expect((await sheet()).projects[0].lines[0].estimate.figures.fundIds).toEqual([a, b, team]);
  });

  it("goes on with as many funds as it takes, one after the other, until the line is covered", async () => {
    const names = ["F1", "F2", "F3", "F4", "F5"];
    const ids: number[] = [];
    for (const name of names) ids.push(await fund(name, 100, { group: "g" }));
    const { lineId, estimate } = await paid([ids[0]!], 450);
    expect(estimate.shortCents).toBe(35_000);
    let version = 1;
    // each added fund covers its 100.00 and the line is short by less, until the fifth one covers it
    for (const [count, shortCents] of [[2, 25_000], [3, 15_000], [4, 5_000], [5, 0]] as const) {
      const answer = await api.patch(`/api/lines/${lineId}`, { version, figures: { estimate: { fundIds: ids.slice(0, count) } } });
      expect(answer.status).toBe(200);
      version += 1;
      const line = (await sheet()).projects[0].lines[0];
      expect([count, line.estimate.shortCents]).toEqual([count, shortCents]);
      expect(line.estimate.shares).toHaveLength(count);
    }
  });

  it("follows a fund that changes: the next sheet already uses the new rate", async () => {
    const s = await fund("S", 5000, { vatRate: 22 });
    await paid([s], 1000);
    await api.patch(`/api/funds/${s}`, { vatRate: 0 });
    expect((await sheet()).projects[0].lines[0].estimate.amounts.vatCents).toBe(0);
  });
});
