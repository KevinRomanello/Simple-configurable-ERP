import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const contract = (body: object) => api.post("/api/funds/contracts", { phase: "estimate", amount: "1000", ...body });

describe("funds and contracts", () => {
  it("creates a fund with its first contract and reuses it for the same name in any case", async () => {
    expect((await contract({ fundName: "Sponsor A", inflowDate: "2026-01-09" })).status).toBe(201);
    await contract({ fundName: "SPONSOR a", amount: "500" });
    const funds = (await api.get("/api/funds")).body;
    expect(funds.map((f: any) => f.name)).toEqual(["Team's fund", "Sponsor A"]);
    expect((await api.get("/api/funds/contracts?phase=estimate")).body).toHaveLength(2);
  });

  it("allows contracts without a date and with a zero amount", async () => {
    expect((await contract({ fundName: "X", amount: "0" })).status).toBe(201);
  });

  it("offers a fund for a phase only if it has a contract in that phase", async () => {
    await contract({ fundName: "Only estimate" });
    await api.post("/api/funds/contracts", { phase: "actual", fundName: "Only actual", amount: "1" });
    const names = async (phase: string) => (await api.get(`/api/funds?phase=${phase}`)).body.map((f: any) => f.name);
    expect(await names("estimate")).toEqual(["Team's fund", "Only estimate"]);
    expect(await names("actual")).toEqual(["Team's fund", "Only actual"]);
  });

  it("the team fund cannot have contracts or be deleted", async () => {
    expect((await contract({ fundName: "team's FUND" })).status).toBe(400);
    const team = (await api.get("/api/funds")).body[0];
    expect((await api.del(`/api/funds/${team.id}`)).status).toBe(400);
  });

  it("sets the pays-VAT boxes per phase", async () => {
    const fund = (await contract({ fundName: "X" })).body.fundId;
    const updated = await api.patch(`/api/funds/${fund}`, { paysVatActual: true });
    expect(updated.body).toMatchObject({ paysVatEstimate: false, paysVatActual: true });
    expect((await api.patch("/api/funds/9999", { paysVatActual: true })).status).toBe(404);
  });

  it("refuses to delete a fund with contracts or paying budget lines, and deletes a free one", async () => {
    const created = (await contract({ fundName: "X" })).body;
    expect((await api.del(`/api/funds/${created.fundId}`)).status).toBe(409); // has a contract

    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/projects/${project.id}/lines`, {
      item: "A",
      figures: { estimate: { quantity: 1, unitNetCost: "1", fundId: created.fundId } },
    });
    await api.del(`/api/funds/contracts/${created.id}`);
    expect((await api.del(`/api/funds/${created.fundId}`)).status).toBe(409); // pays a line

    const free = (await contract({ fundName: "Free" })).body;
    await api.del(`/api/funds/contracts/${free.id}`);
    expect((await api.del(`/api/funds/${free.fundId}`)).status).toBe(204);
  });

  it("rejects bad input", async () => {
    expect((await contract({ fundName: "" })).status).toBe(400);
    expect((await contract({ fundName: "X", amount: "-5" })).status).toBe(400);
    expect((await contract({ fundName: "X", inflowDate: "nope" })).status).toBe(400);
    expect((await api.get("/api/funds/contracts?phase=never")).status).toBe(400);
    expect((await api.del("/api/funds/contracts/9999")).status).toBe(404);
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
