import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addContract, resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

/** Adds a contract to the sponsor `fundName`, created first if it is new. */
const contract = (body: { fundName: string; [key: string]: unknown }) => addContract(api, body as Parameters<typeof addContract>[1]);

describe("sponsors", () => {
  it("creates a plain fund by default, with the VAT rate that must be chosen", async () => {
    const created = await api.post("/api/funds", { name: "Sponsor A", vatRate: 11, group: " Cars " });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Sponsor A", kind: "external", type: "fund", vatRate: 11, group: "Cars",
    });
    // a sponsor is always a virtual fund that covers its VAT: there is nothing to choose about either
    expect(created.body).not.toHaveProperty("mode");
    expect(created.body).not.toHaveProperty("paysVat");
    expect((await api.post("/api/funds", { name: "No rate" })).status).toBe(400); // a fund needs its VAT rate
  });

  it("keeps names unique without regard to case", async () => {
    await api.post("/api/funds", { name: "Sponsor A", vatRate: 22 });
    expect((await api.post("/api/funds", { name: "SPONSOR a", vatRate: 22 })).status).toBe(409);
    const other = (await api.post("/api/funds", { name: "Sponsor B", vatRate: 22 })).body;
    expect((await api.patch(`/api/funds/${other.id}`, { name: "sponsor A" })).status).toBe(409);
    expect((await api.patch(`/api/funds/${other.id}`, { name: "Sponsor B" })).status).toBe(200); // itself is fine
  });

  it("a plain gift owes no VAT and a gift with counter-invoice always 11%, whatever rate is sent", async () => {
    const gift = (await api.post("/api/funds", { name: "Gift", type: "gift", vatRate: 22 })).body;
    const barter = (await api.post("/api/funds", { name: "Barter", type: "gift_vat", vatRate: 22 })).body;
    expect([gift.vatRate, barter.vatRate]).toEqual([0, 11]);
    expect((await api.post("/api/funds", { name: "Barter 0", type: "gift_vat", vatRate: 0 })).body.vatRate).toBe(11);
    // no rate needed for either; a sponsor that gives a fund still has to choose one
    expect((await api.post("/api/funds", { name: "Gift 2", type: "gift" })).body.vatRate).toBe(0);
    expect((await api.post("/api/funds", { name: "Barter 2", type: "gift_vat" })).body.vatRate).toBe(11);
    expect((await api.post("/api/funds", { name: "Fund 2", type: "fund" })).status).toBe(400);
  });

  it("a fixed rate does not depend on the rates an admin lets people choose", async () => {
    const rates = ((await api.get("/api/settings")).body.vatRates as { id: number; rate: number }[]);
    for (const rate of [0, 11]) expect((await api.del(`/api/settings/vat-rates/${rates.find((r) => r.rate === rate)!.id}`)).status).toBe(204);
    expect((await api.post("/api/funds", { name: "Gift", type: "gift" })).body.vatRate).toBe(0);
    expect((await api.post("/api/funds", { name: "Barter", type: "gift_vat" })).body.vatRate).toBe(11);
    expect((await api.post("/api/funds", { name: "Eleven", type: "fund", vatRate: 11 })).status).toBe(400); // a chosen rate still has to be allowed
  });

  it("the rate of a gift with counter-invoice cannot be changed, and follows the type when it changes", async () => {
    const barter = (await api.post("/api/funds", { name: "Barter", type: "gift_vat" })).body;
    expect((await api.patch(`/api/funds/${barter.id}`, { vatRate: 22 })).body.vatRate).toBe(11);
    expect((await api.patch(`/api/funds/${barter.id}`, { vatRate: 0, group: "g" })).body).toMatchObject({ vatRate: 11, group: "g" });

    const fund = (await api.post("/api/funds", { name: "Fund", type: "fund", vatRate: 22 })).body;
    expect((await api.patch(`/api/funds/${fund.id}`, { type: "gift_vat" })).body).toMatchObject({ type: "gift_vat", vatRate: 11 });
    // turned back into a fund, it keeps the 11 and is free to change again
    expect((await api.patch(`/api/funds/${fund.id}`, { type: "fund" })).body.vatRate).toBe(11);
    expect((await api.patch(`/api/funds/${fund.id}`, { vatRate: 22 })).body.vatRate).toBe(22);
  });

  it("accepts only an allowed VAT rate and a known type", async () => {
    expect((await api.post("/api/funds", { name: "Eleven", vatRate: 11 })).status).toBe(201);
    expect((await api.post("/api/funds", { name: "Odd", vatRate: 17 })).status).toBe(400);
    expect((await api.post("/api/funds", { name: "Bad", type: "loan", vatRate: 22 })).status).toBe(400);
  });

  it("changes every parameter, checking the result as a whole", async () => {
    const fund = (await api.post("/api/funds", { name: "S", vatRate: 22 })).body;
    const changed = await api.patch(`/api/funds/${fund.id}`, { name: "Renamed", vatRate: 0, group: "g" });
    expect(changed.body).toMatchObject({ name: "Renamed", vatRate: 0, group: "g" });
    expect((await api.patch(`/api/funds/${fund.id}`, { type: "gift" })).body).toMatchObject({ type: "gift", vatRate: 0 });
    expect((await api.patch(`/api/funds/${fund.id}`, { group: null })).body.group).toBeNull();
    expect((await api.patch("/api/funds/9999", { group: "g" })).status).toBe(404);
  });

  it("brings its money with it: a contract per phase, saved together with the sponsor", async () => {
    const created = await api.post("/api/funds", {
      name: "Rich",
      vatRate: 22,
      contracts: [
        { phase: "estimate", amount: "2500.50", inflowDate: "2026-11-01" },
        { phase: "actual", amount: "1000" },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.contracts).toEqual({
      estimate: { amount: "2500.50", inflowDate: "2026-11-01" },
      actual: { amount: "1000.00", inflowDate: null },
    });
    expect((await api.get("/api/funds")).body.find((f: any) => f.name === "Rich").contracts.estimate.amount).toBe("2500.50");
    // usable in both phases at once
    for (const phase of ["estimate", "actual"]) {
      expect((await api.get(`/api/funds?phase=${phase}`)).body.map((f: any) => f.name)).toContain("Rich");
    }
  });

  it("leaves nothing behind when the money or the sponsor is refused", async () => {
    const refused = [
      await api.post("/api/funds", { name: "Gift", type: "gift", contracts: [{ phase: "estimate", amount: "10" }] }), // goods have no contract
      await api.post("/api/funds", { name: "Big", vatRate: 22, contracts: [{ phase: "estimate", amount: "1000000000.01" }] }),
      await api.post("/api/funds", { name: "Late", vatRate: 22, contracts: [{ phase: "estimate", amount: "1", inflowDate: "nope" }] }),
      await api.post("/api/funds", { name: "Three", vatRate: 22, contracts: [1, 2, 3].map(() => ({ phase: "actual", amount: "1" })) }),
      await api.post("/api/funds", { name: "Twice", vatRate: 22, contracts: [1, 2].map(() => ({ phase: "actual", amount: "1" })) }), // one per phase
    ];
    expect(refused.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
    expect((await api.get("/api/funds")).body.map((f: any) => f.name)).toEqual(["Team's fund"]);
  });

  it("the team fund has no sponsor settings", async () => {
    const team = (await api.get("/api/funds")).body[0];
    expect(team).toMatchObject({ kind: "team", type: "fund", vatRate: null, group: null });
    expect((await api.patch(`/api/funds/${team.id}`, { group: "g" })).status).toBe(400);
  });
});

describe("the money of a sponsor", () => {
  const money = async (name: string) => (await api.get("/api/funds")).body.find((f: any) => f.name === name)?.contracts;

  it("is one value and one date per phase, set and replaced in place, even for zero", async () => {
    expect((await contract({ fundName: "Sponsor A", inflowDate: "2026-01-09" })).status).toBe(200);
    expect((await money("Sponsor A")).estimate).toEqual({ amount: "1000.00", inflowDate: "2026-01-09" });
    // the same sponsor and phase again replaces it; the other phase is not touched
    expect((await contract({ fundName: "SPONSOR a", amount: "500" })).status).toBe(200);
    expect((await contract({ fundName: "Sponsor A", phase: "actual", amount: "0" })).status).toBe(200);
    expect(await money("Sponsor A")).toEqual({ estimate: { amount: "500.00", inflowDate: null }, actual: { amount: "0.00", inflowDate: null } });
  });

  it("is taken away phase by phase", async () => {
    const id = (await contract({ fundName: "X" })).body.fundId;
    expect((await api.del(`/api/funds/${id}/contracts/estimate`)).status).toBe(204);
    expect((await money("X")).estimate).toBeNull();
    expect((await api.del(`/api/funds/${id}/contracts/estimate`)).status).toBe(404);
  });

  it("makes a fund usable in a phase: offered there if it has money, a gift always", async () => {
    await contract({ fundName: "Only estimate" });
    await contract({ fundName: "Only actual", phase: "actual", amount: "1" });
    await api.post("/api/funds", { name: "Gift", type: "gift" });
    const names = async (phase: string) => (await api.get(`/api/funds?phase=${phase}`)).body.map((f: any) => f.name);
    expect(await names("estimate")).toEqual(["Team's fund", "Gift", "Only estimate"]);
    expect(await names("actual")).toEqual(["Team's fund", "Gift", "Only actual"]);
    expect((await names("estimate")).length).toBeLessThan((await api.get("/api/funds")).body.length); // "Only actual" is in the full list
  });

  it("the team fund and a gift have none; an unknown fund answers 404", async () => {
    const team = (await api.get("/api/funds")).body[0];
    const gift = (await api.post("/api/funds", { name: "Gift", type: "gift" })).body;
    for (const fundId of [team.id, gift.id]) {
      expect((await api.put(`/api/funds/${fundId}/contracts/estimate`, { amount: "1" })).status).toBe(400);
    }
    expect((await api.put("/api/funds/9999/contracts/estimate", { amount: "1" })).status).toBe(404);
    expect((await api.del(`/api/funds/${team.id}`)).status).toBe(400);
  });

  it("a sponsor that has money cannot turn into one that gives goods before it is taken away", async () => {
    const id = (await contract({ fundName: "X" })).body.fundId;
    expect((await api.patch(`/api/funds/${id}`, { type: "gift" })).status).toBe(400);
    await api.del(`/api/funds/${id}/contracts/estimate`);
    expect((await api.patch(`/api/funds/${id}`, { type: "gift" })).status).toBe(200);
  });

  it("deletes a sponsor together with its money, but not one that pays budget lines", async () => {
    const created = (await contract({ fundName: "X" })).body;
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 1, unitNetCost: "1", fundIds: [created.fundId] } },
    });
    expect((await api.del(`/api/funds/${created.fundId}`)).status).toBe(409); // pays a line

    const free = (await contract({ fundName: "Free" })).body;
    expect((await api.del(`/api/funds/${free.fundId}`)).status).toBe(204);
    expect((await api.get("/api/funds")).body.map((f: any) => f.name)).not.toContain("Free");
  });

  it("rejects bad input", async () => {
    expect((await api.post("/api/funds", { name: "", vatRate: 22 })).status).toBe(400);
    expect((await contract({ fundName: "X", amount: "-5" })).status).toBe(400);
    expect((await contract({ fundName: "X", inflowDate: "nope" })).status).toBe(400);
    const id = (await contract({ fundName: "Y" })).body.fundId;
    expect((await api.put(`/api/funds/${id}/contracts/never`, { amount: "1" })).status).toBe(400);
  });
});

describe("suppliers", () => {
  it("keeps one list, unique without regard to case, A-Z", async () => {
    await api.post("/api/suppliers", { name: "wiauto" });
    await api.post("/api/suppliers", { name: "Amazon" });
    const duplicate = await api.post("/api/suppliers", { name: "WIAUTO" });
    expect(duplicate.status).toBe(409);
    expect((await api.get("/api/suppliers")).body.map((s: any) => s.name)).toEqual(["Amazon", "wiauto"]);
  });

  it("will not delete a supplier that budget lines use", async () => {
    const supplier = (await api.post("/api/suppliers", { name: "Amazon" })).body;
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { actual: { quantity: 1, unitNetCost: "1", supplierId: supplier.id } },
    });
    expect((await api.del(`/api/suppliers/${supplier.id}`)).status).toBe(409);
    const free = (await api.post("/api/suppliers", { name: "Free" })).body;
    expect((await api.del(`/api/suppliers/${free.id}`)).status).toBe(204);
    expect((await api.del(`/api/suppliers/${free.id}`)).status).toBe(404);
  });
});

describe("cash flow inflows and BANK", () => {
  it("records inflows per phase and deletes them", async () => {
    const created = await api.post("/api/inflows", { phase: "estimate", sourceName: "X", amount: "100.50", inflowDate: "2026-12-05" });
    expect(created.status).toBe(201);
    await api.post("/api/inflows", { phase: "actual", sourceName: "Y", amount: "1" });
    expect((await api.get("/api/inflows?phase=estimate")).body).toHaveLength(1);
    expect((await api.del(`/api/inflows/${created.body.id}`)).status).toBe(204);
    expect((await api.get("/api/inflows?phase=estimate")).body).toEqual([]);
    expect((await api.post("/api/inflows", { phase: "estimate", sourceName: "X", amount: "-1" })).status).toBe(400);
  });

  it("sets, replaces and clears the BANK balance", async () => {
    expect((await api.get("/api/bank")).body).toBeNull();
    await api.put("/api/bank", { amount: "5000", asOfDate: "2026-11-15" });
    await api.put("/api/bank", { amount: "5600.00", asOfDate: "2026-10-15" });
    expect((await api.get("/api/bank")).body).toMatchObject({ amount: "5600.00", asOfDate: "2026-10-15" });
    await api.put("/api/bank", { amount: "10" });
    expect((await api.get("/api/bank")).body.asOfDate).toBeNull();
    expect((await api.del("/api/bank")).status).toBe(204);
    expect((await api.get("/api/bank")).body).toBeNull();
    expect((await api.put("/api/bank", { amount: "abc" })).status).toBe(400);
  });
});

describe("sponsors that give goods are suppliers too", () => {
  const suppliers = async () => ((await api.get("/api/suppliers")).body as { name: string }[]).map((s) => s.name);

  it("adds the sponsor to BOUGHT FROM when it gives goods, with or without VAT, and not when it gives a fund", async () => {
    await api.post("/api/funds", { name: "Gift", type: "gift" });
    await api.post("/api/funds", { name: "Barter", type: "gift_vat" });
    await api.post("/api/funds", { name: "Money", type: "fund", vatRate: 22 });
    expect(await suppliers()).toEqual(["Barter", "Gift"]);
  });

  it("uses the supplier that is already there, whatever the case, instead of making another", async () => {
    await api.post("/api/suppliers", { name: "ACME" });
    expect((await api.post("/api/funds", { name: "Acme", type: "gift" })).status).toBe(201);
    expect(await suppliers()).toEqual(["ACME"]);
  });

  it("adds it when a sponsor that gave money starts giving goods", async () => {
    const money = (await api.post("/api/funds", { name: "Sponsor", type: "fund", vatRate: 22 })).body;
    expect(await suppliers()).toEqual([]);
    await api.patch(`/api/funds/${money.id}`, { type: "gift" });
    expect(await suppliers()).toEqual(["Sponsor"]);
  });

  it("renames the supplier with the sponsor, unless another supplier already has the new name", async () => {
    const alpha = (await api.post("/api/funds", { name: "Alpha", type: "gift" })).body;
    await api.patch(`/api/funds/${alpha.id}`, { name: "Alpha Srl" });
    expect(await suppliers()).toEqual(["Alpha Srl"]);
    await api.patch(`/api/funds/${alpha.id}`, { name: "ALPHA SRL" }); // only the case
    expect(await suppliers()).toEqual(["ALPHA SRL"]);

    await api.post("/api/suppliers", { name: "Beta" });
    await api.patch(`/api/funds/${alpha.id}`, { name: "Beta" });
    expect(await suppliers()).toEqual(["ALPHA SRL", "Beta"]); // both stay: the supplier Beta is simply the sponsor's now
  });

  it("leaves the supplier of a sponsor that is renamed as a fund, or deleted", async () => {
    const money = (await api.post("/api/funds", { name: "Money", type: "fund", vatRate: 22 })).body;
    await api.post("/api/suppliers", { name: "Money" });
    await api.patch(`/api/funds/${money.id}`, { name: "Cash" });
    expect(await suppliers()).toEqual(["Money"]); // a fund has no supplier to follow

    const gift = (await api.post("/api/funds", { name: "Gift", type: "gift" })).body;
    expect((await api.del(`/api/funds/${gift.id}`)).status).toBe(204);
    expect(await suppliers()).toEqual(["Gift", "Money"]); // it may be on lines already bought
  });
});
