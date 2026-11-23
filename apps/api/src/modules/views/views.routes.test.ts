import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addContract, resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

// The scenario of docs/regole-script-attuale.md, section 17, built only through the API:
// BANK 5 000.00 on 15 Nov 2026, inflows of 2 000.00 (10 Nov) and 1 000.00 (5 Dec), and one
// purchase from the team fund on 20 Nov: net 500.00, VAT 22%, so outflow 610.00 with 110.00 VAT
// (an allowed rate: the API refuses others), due 16 Feb 2027.
async function buildScenario() {
  await api.put("/api/bank", { amount: "5000", asOfDate: "2026-11-15" });
  await api.post("/api/inflows", { phase: "estimate", sourceName: "X", amount: "2000", inflowDate: "2026-11-10" });
  await api.post("/api/inflows", { phase: "estimate", sourceName: "Y", amount: "1000", inflowDate: "2026-12-05" });
  const team = (await api.get("/api/funds")).body[0];
  const project = (await api.post("/api/projects", { areaCode: "mt-dmt", name: "P" })).body;
  const line = await api.post(`/api/projects/${project.id}/lines`, {
    item: "Part",
    category: "Asset",
    figures: {
      estimate: {
        quantity: 1, unitNetCost: "500", sponsorType: "none", vatRate: 22, fundIds: [team.id], purchaseDate: "2026-11-20",
      },
    },
  });
  expect(line.status, JSON.stringify(line.body)).toBe(201);
}

describe("views over data written through the API", () => {
  it("cash flow reproduces the worked example", async () => {
    await buildScenario();
    const { body } = await api.get("/api/views/cashflow");
    expect(body.bank).toEqual({ amountCents: 500_000, asOfDate: "2026-11-15" });
    // the purchase and its VAT (610.00) plus the 11% VAT on the two inflows (220.00 + 110.00, paid on 1 Jan 2027)
    expect(body.estimate.summary).toMatchObject({ totalCashFlowCents: 600_000, teamOutflowsCents: 61_000 + 33_000, leftValueCents: 506_000 });
    expect(body.estimate.monthly).toHaveLength(2);
  });

  it("gantt shows the running balance of the team fund", async () => {
    await buildScenario();
    const { body } = await api.get("/api/views/gantt?phase=estimate");
    expect(body.months).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(body.teamFund.rows.map((r: any) => r.finalCents)).toEqual([500_000, 600_000, 567_000, 556_000]);
  });

  it("totals, VAT report and the items list see the line", async () => {
    await buildScenario();
    const totals = (await api.get("/api/views/totals")).body;
    expect(totals.blocks[0].total.estimateOutflowCents).toBe(61_000);
    const report = (await api.get("/api/views/vat-report?area=mt-dmt")).body;
    expect(report.deadlines).toContain("2027-02-16");
    expect(report.projects[0].estimateCents.reduce((a: number, b: number) => a + b, 0)).toBe(11_000);
    const items = (await api.get("/api/views/items?categories=Asset&sort=estimate-date")).body;
    expect(items.rows.map((r: any) => r.item)).toEqual(["Part"]);
    expect((await api.get("/api/views/items?categories=Software")).body.rows).toEqual([]);
  });

  it("fund summary and analyses follow the contracts and spending", async () => {
    const created = (await addContract(api, { fundName: "Sponsor", amount: "1000", inflowDate: "2026-01-09" })).body;
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 1, unitNetCost: "100", fundIds: [created.fundId] } },
    });
    const summary = (await api.get("/api/views/funds-summary?phase=estimate")).body;
    expect(summary.rows[0]).toMatchObject({ name: "Sponsor", totalContractCents: 100_000, leftCents: 100_000 - 12_200 });
    expect(summary.monthly).toEqual([{ month: "2026-01", totalCents: 100_000, names: ["Sponsor"] }]);
    const analysis = (await api.get("/api/views/analysis/funds")).body;
    expect(analysis.names).toEqual([{ estimate: "Sponsor", actual: null }]);
  });

  it("a fund with no limit has a row in ACTUAL with what was spent, and one in EXPECTED when a line expects to spend with it", async () => {
    const free = (await api.post("/api/funds", { name: "Free", vatRate: 22, unlimited: true })).body;
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { actual: { quantity: 1, unitNetCost: "100", fundIds: [free.id] } },
    });
    const actual = (await api.get("/api/views/funds-summary?phase=actual")).body;
    expect(actual.rows).toEqual([{ fundId: free.id, name: "Free", totalContractCents: null, outflowCents: 12_200, vatCents: 2_200, leftCents: null }]);
    expect(actual.monthly).toEqual([]); // no money comes in
    expect((await api.get("/api/views/funds-summary?phase=estimate")).body.rows).toEqual([
      { fundId: free.id, name: "Free", totalContractCents: null, outflowCents: 0, vatCents: 0, leftCents: null },
    ]); // listed with nothing expected yet
    const first = (await api.get("/api/areas/sw/sheet")).body.projects[0].lines[0];
    await api.patch(`/api/lines/${first.id}`, { version: first.version, figures: { estimate: { quantity: 1, unitNetCost: "50", fundIds: [free.id] } } });
    expect((await api.get("/api/views/funds-summary?phase=estimate")).body.rows).toEqual([
      { fundId: free.id, name: "Free", totalContractCents: null, outflowCents: 6_100, vatCents: 1_100, leftCents: null },
    ]);
    // the analyses by fund list it as well: it is a fund like the others
    expect((await api.get("/api/views/analysis/funds")).body.names).toEqual([{ estimate: "Free", actual: "Free" }]);
    // and it is not a shortfall for the cash flow
    expect((await api.get("/api/views/cashflow")).body.actual.summary).toMatchObject({ shortfallCents: 0 });
  });

  it("goods have a row in each phase: what is expected to be spent with them and what was spent", async () => {
    const gift = (await api.post("/api/funds", { name: "Goods", type: "gift", vatRate: 0 })).body;
    const barter = (await api.post("/api/funds", { name: "Barter", type: "gift_vat", vatRate: 11 })).body;
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    const add = (item: string, fundId: number, estimate: string, actual: string) =>
      api.post(`/api/projects/${project.id}/lines`, {
        item,
        figures: {
          estimate: { quantity: 1, unitNetCost: estimate, fundIds: [fundId] },
          actual: { quantity: 1, unitNetCost: actual, fundIds: [fundId] },
        },
      });
    expect((await add("A", gift.id, "100", "80")).status).toBe(201);
    expect((await add("B", barter.id, "50", "40")).status).toBe(201);
    const row = async (phase: string) => (await api.get(`/api/views/funds-summary?phase=${phase}`)).body.rows.map((r: any) => [r.name, r.totalContractCents, r.outflowCents, r.vatCents, r.leftCents]);
    // the net of the goods, plus the VAT of the counter-invoice (11%), which the team pays
    expect(await row("estimate")).toEqual([["Barter", null, 5_550, 550, null], ["Goods", null, 10_000, 0, null]]);
    expect(await row("actual")).toEqual([["Barter", null, 4_440, 440, null], ["Goods", null, 8_000, 0, null]]);
    // and they are not a shortfall for the cash flow
    expect((await api.get("/api/views/cashflow")).body.estimate.summary).toMatchObject({ shortfallCents: 0 });
  });

  it("answers 404 for an unknown area and 400 for a bad filter", async () => {
    expect((await api.get("/api/views/vat-report?area=nope")).status).toBe(404);
    expect((await api.get("/api/views/vat-report")).status).toBe(400);
    expect((await api.get("/api/views/funds-summary?phase=nope")).status).toBe(400);
  });

  it("works on an empty database", async () => {
    for (const url of ["/api/views/totals", "/api/views/cashflow", "/api/views/gantt?phase=actual", "/api/views/analysis/suppliers", "/api/views/items"]) {
      expect((await api.get(url)).status, url).toBe(200);
    }
  });
});
