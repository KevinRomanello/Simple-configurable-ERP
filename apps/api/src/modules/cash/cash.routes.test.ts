import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { today } from "../../core/today";
import { resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

// the treasury and the sponsors are two boxes of a project manager
const TREASURER = { email: "treasury@team.test", role: "pm" as const, treasury: true };
const SP = { email: "sp@team.test", role: "pm" as const, sponsors: true };
const PM = { email: "pm@team.test", role: "pm" as const, areas: ["mt-dmt"] };
const VIEWER = { email: "viewer@team.test", role: "viewer" as const };

const entry = (body: object = {}) => ({ on: "2026-03-10", description: "Test", account: "bank", direction: "out", amount: "10.00", ...body });
const add = async (body: object = {}) => {
  const created = await api.post("/api/cash/entries", entry(body));
  expect(created.status).toBe(201);
  return created.body;
};
const register = async (year = 2026) => (await api.get(`/api/cash/register?year=${year}`)).body;
const voce = async (name: string) => (await api.get("/api/cash/categories")).body.find((c: { name: string }) => c.name === name);

describe("who can use the register", () => {
  it("the admins and a project manager with the treasury box can; a project manager without it, one with only the sponsors box and a viewer cannot (the server says 403, not only the menu)", async () => {
    expect((await api.get("/api/cash/register")).status).toBe(200);
    expect((await api.as(TREASURER).get("/api/cash/register")).status).toBe(200);
    for (const person of [PM, VIEWER, SP]) {
      const as = api.as(person);
      const answers = [
        await as.get("/api/cash/register"),
        await as.post("/api/cash/entries", entry()),
        await as.get("/api/cash/categories"),
        await as.get("/api/cash/methods"),
        await as.put("/api/cash/openings", { year: 2026, account: "bank", amount: "1" }),
      ];
      expect(answers.map((a) => a.status)).toEqual([403, 403, 403, 403, 403]);
    }
  });

  it("the treasury keeps CASH FLOW (inflows, BANK) but not CASH FROM (sponsors), and is otherwise the project manager they are", async () => {
    const as = api.as(TREASURER);
    expect((await as.post("/api/inflows", { phase: "estimate", sourceName: "Gala", amount: "100" })).status).toBe(201);
    expect((await as.put("/api/bank", { amount: "100" })).status).toBe(200);
    expect((await as.post("/api/funds", { name: "Acme", vatRate: 22 })).status).toBe(403);
    expect((await as.post("/api/projects", { areaCode: "sw", name: "X" })).status).toBe(403); // no areas assigned
    expect((await as.get("/api/areas/sw/sheet")).status).toBe(200);
    expect((await as.get("/api/me")).body.permissions).toMatchObject({ canManageCash: true, canEditShared: false, canManageInventory: true, canViewHistory: true });
    expect((await api.as(PM).get("/api/me")).body.permissions.canManageCash).toBe(false);
    expect((await api.as(PM).post("/api/inflows", { phase: "estimate", sourceName: "Gala", amount: "100" })).status).toBe(403);
  });

  it("a project manager with the sponsors box keeps the sponsors and their money (CASH FROM) and nothing of the team's money", async () => {
    const as = api.as(SP);
    const sponsor = await as.post("/api/funds", { name: "Acme", vatRate: 22 });
    expect(sponsor.status).toBe(201);
    expect((await as.put(`/api/funds/${sponsor.body.id}/contracts/estimate`, { amount: "1000" })).status).toBe(200);
    expect((await as.patch(`/api/funds/${sponsor.body.id}`, { name: "Acme 2" })).status).toBe(200);
    expect((await as.del(`/api/funds/${sponsor.body.id}`)).status).toBe(204);
    expect((await as.post("/api/inflows", { phase: "estimate", sourceName: "Gala", amount: "100" })).status).toBe(403);
    expect((await as.put("/api/bank", { amount: "100" })).status).toBe(403);
    expect((await as.post("/api/projects", { areaCode: "sw", name: "X" })).status).toBe(403);
    expect((await as.get("/api/me")).body.permissions).toMatchObject({ canEditShared: true, canManageCash: false, canManageInventory: true, canViewHistory: true });
    // a project manager, with or without the treasury box, does not keep the sponsors unless the sponsors box is ticked
    expect((await api.as(TREASURER).post("/api/funds", { name: "Beta", vatRate: 22 })).status).toBe(403);
  });

  it("the treasury and the sponsors are boxes of a project manager, set by an admin, and cleared when the person is anything else", async () => {
    const as = api.as({ email: "box@team.test", role: "pm" });
    const me = (await as.get("/api/me")).body;
    expect((await as.get("/api/cash/register")).status).toBe(403);
    const ticked = await api.patch(`/api/users/${me.id}`, { treasury: true });
    expect(ticked.body).toMatchObject({ role: "pm", treasury: true });
    expect((await as.get("/api/cash/register")).status).toBe(200); // from their next request on
    expect((await api.get("/api/users")).body.find((u: any) => u.id === me.id).treasury).toBe(true);

    expect((await api.patch(`/api/users/${me.id}`, { role: "viewer" })).body).toMatchObject({ role: "viewer", treasury: false });
    expect((await as.get("/api/cash/register")).status).toBe(403);
    expect((await api.patch(`/api/users/${me.id}`, { treasury: true })).status).toBe(400); // not a project manager
    expect((await api.patch(`/api/users/${me.id}`, { role: "pm", treasury: true })).body).toMatchObject({ role: "pm", treasury: true });

    // the sponsors box opens CASH FROM, from the next request on, and goes with the role like the other one
    expect((await as.post("/api/funds", { name: "Gamma", vatRate: 22 })).status).toBe(403);
    expect((await api.patch(`/api/users/${me.id}`, { sponsors: true })).body).toMatchObject({ role: "pm", treasury: true, sponsors: true });
    expect((await as.post("/api/funds", { name: "Gamma", vatRate: 22 })).status).toBe(201);
    expect((await api.patch(`/api/users/${me.id}`, { role: "viewer" })).body).toMatchObject({ role: "viewer", treasury: false, sponsors: false });
    expect((await as.post("/api/funds", { name: "Delta", vatRate: 22 })).status).toBe(403);
    expect((await api.patch(`/api/users/${me.id}`, { sponsors: true })).status).toBe(400); // not a project manager
    expect((await api.as(PM).patch(`/api/users/${me.id}`, { treasury: true })).status).toBe(403); // admins only
  });

  it("an admin keeps the money of the team without any box", async () => {
    expect((await api.get("/api/me")).body.permissions).toMatchObject({ canManageCash: true, canEditShared: true });
  });
});

describe("the register and its balances", () => {
  it("runs every account on its own, in the order of the days, and the total is cassa + banca", async () => {
    await api.put("/api/cash/openings", { year: 2026, account: "cash", amount: "100" });
    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: "1000" });
    await add({ on: "2026-01-05", account: "bank", direction: "in", amount: "250" });
    await add({ on: "2026-01-03", account: "cash", direction: "out", amount: "30.50" });
    await add({ on: "2026-01-05", account: "paypal", direction: "in", amount: "28" });
    await add({ on: "2026-01-06", account: "bank", direction: "out", amount: "0.25" });

    const r = await register();
    expect(r.entries.map((e: any) => [e.on, e.account, e.cents])).toEqual([
      ["2026-01-03", "cash", -3050], ["2026-01-05", "bank", 25000], ["2026-01-05", "paypal", 2800], ["2026-01-06", "bank", -25],
    ]);
    expect(r.entries.at(-1).balances).toEqual({ cash: 6950, bank: 124975, paypal: 2800 });
    expect(r.entries.at(-1).total).toBe(131925);
    expect(r.opening).toEqual({ cash: 10000, bank: 100000, paypal: 0 });
    expect(r.closing).toEqual({ cash: 6950, bank: 124975, paypal: 2800 });
    expect(r.total).toEqual({ opening: 110000, closing: 131925 });
  });

  it("a year starts where the year before ended, unless an opening is typed for it", async () => {
    await api.put("/api/cash/openings", { year: 2025, account: "bank", amount: "500" });
    await add({ on: "2025-12-30", direction: "in", amount: "100" });
    await add({ on: "2026-02-01", direction: "out", amount: "50" });
    let r = await register(2026);
    expect(r.opening.bank).toBe(60000);
    expect(r.openingSet.bank).toBe(false);
    expect(r.closing.bank).toBe(55000);
    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: "-20.5" }); // can be negative
    r = await register(2026);
    expect(r.opening.bank).toBe(-2050);
    expect(r.openingSet.bank).toBe(true);
    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: null });
    expect((await register(2026)).opening.bank).toBe(60000);
    expect((await register(2027)).opening.bank).toBe(55000); // a year without movements carries over too
    expect((await register(2026)).years).toContain(2025);
  });

  it("changing or deleting a movement changes every balance after it", async () => {
    const first = await add({ on: "2026-01-01", direction: "in", amount: "100" });
    await add({ on: "2026-01-02", direction: "out", amount: "40" });
    expect((await register()).closing.bank).toBe(6000);
    const patched = await api.patch(`/api/cash/entries/${first.id}`, { amount: "300", description: "Bigger" });
    expect(patched.body).toMatchObject({ cents: 30000, description: "Bigger" });
    expect((await register()).closing.bank).toBe(26000);
    await api.patch(`/api/cash/entries/${first.id}`, { direction: "out", account: "cash" });
    const r = await register();
    expect(r.closing).toEqual({ cash: -30000, bank: -4000, paypal: 0 });
    expect((await api.del(`/api/cash/entries/${first.id}`)).status).toBe(204);
    expect((await register()).closing).toEqual({ cash: 0, bank: -4000, paypal: 0 });
    expect((await api.del(`/api/cash/entries/${first.id}`)).status).toBe(404);
    expect((await api.patch("/api/cash/entries/99999", { amount: "1" })).status).toBe(404);
  });

  it("refuses what makes no sense: zero or negative money, an impossible date, a Voce that does not exist", async () => {
    const bad = async (body: object) => (await api.post("/api/cash/entries", entry(body))).status;
    expect(await bad({ amount: "0" })).toBe(400);
    expect(await bad({ amount: "-5" })).toBe(400);
    expect(await bad({ amount: "1.005" })).toBe(400);
    expect(await bad({ on: "2026-02-30" })).toBe(400);
    expect(await bad({ account: "wallet" })).toBe(400);
    expect(await bad({ categoryId: 99999 })).toBe(400);
    expect(await bad({ methodId: 99999 })).toBe(400);
    expect(await bad({ description: "x".repeat(501) })).toBe(400);
  });

  it("the sponsorship box belongs to money in only", async () => {
    const money = await add({ direction: "in", amount: "100", sponsorship: true });
    expect((await api.post("/api/cash/entries", entry({ direction: "out", sponsorship: true }))).body.sponsorship).toBe(false);
    expect(money.sponsorship).toBe(true);
    const flipped = await api.patch(`/api/cash/entries/${money.id}`, { direction: "out" });
    expect(flipped.body).toMatchObject({ cents: -10000, sponsorship: false });
  });

  it("keeps the movements of the sheet apart from the other years", async () => {
    await add({ on: "2025-12-31" });
    await add({ on: "2026-01-01" });
    expect((await register(2025)).entries).toHaveLength(1);
    expect((await register(2026)).entries).toHaveLength(1);
    expect((await api.get("/api/cash/register?year=abc")).status).toBe(400);
  });

  it("records every change in the history", async () => {
    const created = await add({ description: "Fee" });
    await api.patch(`/api/cash/entries/${created.id}`, { amount: "11" });
    const history = (await api.get("/api/audit?table=cash_entry")).body.entries;
    expect(history.map((h: any) => [h.action, h.label])).toEqual([["update", "Fee"], ["insert", "Fee"]]);
  });
});

describe("the Voci and the payment methods", () => {
  it("start with the ones of the sheet, with 6.1 as sponsorship by default", async () => {
    const voci = (await api.get("/api/cash/categories")).body;
    expect(voci.length).toBeGreaterThan(40);
    expect(voci.filter((v: any) => v.sponsorship).map((v: any) => v.name)).toEqual(["6.1 Da pubblicità e sponsorizzazioni"]);
    expect((await api.get("/api/cash/methods")).body.map((m: any) => m.name)).toEqual([
      "Completato bonifico", "Completato visa", "Cassa", "Paypal", "Automatico",
    ]);
  });

  it("can be added, renamed, ordered; a used one is not deleted; names are unique in any case", async () => {
    const created = await api.post("/api/cash/categories", { name: "10.1 Prova", sponsorship: true });
    expect(created.body).toMatchObject({ name: "10.1 Prova", sponsorship: true });
    expect((await api.post("/api/cash/categories", { name: "10.1 PROVA" })).status).toBe(409);
    await api.patch(`/api/cash/categories/${created.body.id}`, { name: "10.1 Altro", sponsorship: false });
    expect(await voce("10.1 Altro")).toMatchObject({ sponsorship: false, usedBy: 0 });

    await add({ categoryId: created.body.id });
    expect((await voce("10.1 Altro")).usedBy).toBe(1);
    expect((await api.del(`/api/cash/categories/${created.body.id}`)).status).toBe(409);

    const ids = (await api.get("/api/cash/categories")).body.map((v: any) => v.id).reverse();
    expect((await api.put("/api/cash/categories/order", { ids })).status).toBe(204);
    expect((await api.get("/api/cash/categories")).body[0].id).toBe(ids[0]);
    expect((await api.put("/api/cash/categories/order", { ids: ids.slice(1) })).status).toBe(400);

    const method = await api.post("/api/cash/methods", { name: "Carta prepagata" });
    await api.patch(`/api/cash/methods/${method.body.id}`, { name: "Prepagata" });
    await add({ methodId: method.body.id });
    expect((await api.del(`/api/cash/methods/${method.body.id}`)).status).toBe(409);
    expect((await api.get("/api/cash/methods")).body.at(-1)).toMatchObject({ name: "Prepagata", usedBy: 1 });
    expect((await api.del("/api/cash/methods/99999")).status).toBe(404);
  });

  it("are in the register's answer for its form", async () => {
    const r = await register();
    expect(r.entries).toEqual([]);
  });
});

describe("the sponsorship box of an inflow", () => {
  const vatOf = async () => (await api.get("/api/views/cashflow")).body.estimate.summary.teamOutflowsCents;

  it("is on by default, as before: the inflow owes 11% VAT; off, it is money like a membership fee, without VAT", async () => {
    await api.post("/api/inflows", { phase: "estimate", sourceName: "Sponsor", amount: "1000", inflowDate: "2026-01-09" });
    expect(await vatOf()).toBe(11_000);
    await api.post("/api/inflows", { phase: "estimate", sourceName: "Fees", amount: "2000", inflowDate: "2026-01-09", sponsorship: false });
    expect(await vatOf()).toBe(11_000); // the fees add no VAT...
    const total = (await api.get("/api/views/cashflow")).body.estimate.summary.totalCashFlowCents;
    expect(total).toBe(300_000); // ...but they are money in
    const listed = (await api.get("/api/inflows?phase=estimate")).body;
    expect(listed.map((i: any) => [i.sourceName, i.sponsorship]).sort()).toEqual([["Fees", false], ["Sponsor", true]]);
  });
});

describe("the BANK of CASH FLOW from the register", () => {
  const later = (days: number) => new Date(new Date(`${today()}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const bank = async () => (await api.get("/api/bank")).body;
  const cashFlow = async () => (await api.get("/api/views/cashflow")).body;
  const money = async (year: number, account: string, amount: string, on: string, direction = "in") =>
    api.post("/api/cash/entries", entry({ on, account, direction, amount, description: "x" }));

  it("is the one written by hand while the register cannot say, and the register's Cassa + Banca once it can", async () => {
    expect(await bank()).toBeNull();
    await api.put("/api/bank", { amount: "100", asOfDate: "2026-02-01" });
    expect(await bank()).toMatchObject({ amount: "100.00", asOfDate: "2026-02-01", source: "typed" });

    await money(2026, "bank", "50", "2026-03-01"); // movements without an opening balance are not a balance
    expect((await bank()).source).toBe("typed");

    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: "1000" });
    await api.put("/api/cash/openings", { year: 2026, account: "cash", amount: "20.5" });
    await api.put("/api/cash/openings", { year: 2026, account: "paypal", amount: "999" }); // Paypal stays apart
    await money(2026, "bank", "30", "2026-04-01", "out");
    expect(await bank()).toEqual({ amount: "1040.50", asOfDate: today(), source: "register" });
    expect((await cashFlow()).bank).toEqual({ amountCents: 104_050, asOfDate: today() });

    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: null });
    await api.put("/api/cash/openings", { year: 2026, account: "cash", amount: null });
    await api.put("/api/cash/openings", { year: 2026, account: "paypal", amount: null });
    expect(await bank()).toMatchObject({ amount: "100.00", source: "typed" }); // back to the written one
  });

  it("starts CASH FLOW from it: inflows after its day count, and one that is late counts from the day after", async () => {
    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: "1000" });
    await api.post("/api/inflows", { phase: "estimate", sourceName: "Past", amount: "400", inflowDate: later(-3), sponsorship: false });
    await api.post("/api/inflows", { phase: "estimate", sourceName: "Tomorrow", amount: "200", inflowDate: later(1), sponsorship: false });
    await api.post("/api/inflows", { phase: "estimate", sourceName: "Later", amount: "300", inflowDate: later(40), sponsorship: false });
    const summary = (await cashFlow()).estimate.summary;
    // "Past" was due and has not arrived (it is not in the register): it is late and still to come, not lost
    expect(summary.totalCashFlowCents).toBe(100_000 + 40_000 + 20_000 + 30_000);
    // the Gantt compares by day too with such a BANK: tomorrow's inflow is in it, even in the same month
    const gantt = (await api.get("/api/views/gantt?phase=estimate")).body;
    const inflow = gantt.teamFund.rows.reduce((sum: number, r: { inflowCents: number }) => sum + r.inflowCents, 0);
    expect(inflow).toBe(100_000 + 40_000 + 20_000 + 30_000);
  });

  it("belongs to the season of today; a season that is over has the register's balance on its last day", async () => {
    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: "1000" });
    await money(2026, "bank", "500", "2026-12-01");
    const old = (await api.post("/api/seasons", { startYear: 2025, car: "Old" })).body;
    const view = (await api.get("/api/views/cashflow", { "x-season": String(old.id) })).body;
    // 2025-2026 ended on 2026-08-31: the 500 of December is not in its BANK
    expect(view.bank).toEqual({ amountCents: 100_000, asOfDate: "2026-08-31" });
  });
});
