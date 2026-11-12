import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { today } from "../../core/today";
import { resetData, testApp } from "../../../test/helpers";

// What is outside the budget, calculated from the register as a derived area (docs/spese-fuori-budget.md).

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const TREASURER = { email: "treasury@team.test", role: "pm" as const, treasury: true };
const year = Number(today().slice(0, 4));

interface Season { startsOn: string; endsOn: string }
const season = async (): Promise<Season> => (await api.get("/api/seasons/current")).body;
const voce = async (name: string) => {
  const found = (await api.get("/api/cash/categories")).body.find((c: { name: string }) => c.name === name);
  expect(found, `the Voce ${name}`).toBeDefined();
  return found as { id: number; name: string; scope: string };
};
/** A movement of the register on a Voce (by name); `cents` positive for money in, negative for money out. */
async function move(name: string | null, cents: number, over: { on?: string; sponsorship?: boolean } = {}) {
  const created = await api.post("/api/cash/entries", {
    on: over.on ?? today(), description: "Test", account: "bank", direction: cents < 0 ? "out" : "in",
    amount: (Math.abs(cents) / 100).toFixed(2), ...(name === null ? {} : { categoryId: (await voce(name)).id }),
    ...(over.sponsorship === undefined ? {} : { sponsorship: over.sponsorship }),
  });
  expect(created.status).toBe(201);
  return created.body as { id: number };
}
const sheet = async () => (await api.get("/api/areas/administration/sheet")).body;
const lineNames = async () => (await sheet()).projects.flatMap((p: { lines: { item: string }[] }) => p.lines.map((l) => l.item));
const month = (date: string) => date.slice(0, 7);

describe("the scope of a Voce", () => {
  it("starts as the register is usually kept: spent on a project, outside the budget, or ignored", async () => {
    const scopes = Object.fromEntries((await api.get("/api/cash/categories")).body.map((c: { name: string; scope: string }) => [c.name, c.scope]));
    expect(scopes["1.1 Attrezzature"]).toBe("project");
    expect(scopes["1.4 Altro"]).toBe("project");
    expect(scopes["8.2 Imposta di bollo"]).toBe("outside");
    expect(scopes["1. QUOTE ASSOCIATIVE"]).toBe("outside");
    expect(scopes["6.1 Da pubblicità e sponsorizzazioni"]).toBe("ignore");
    expect(scopes["9.2 IVA a debito"]).toBe("ignore");
  });

  it("is changed from Settings, a new Voce is spent on a project until said otherwise, and a wrong scope is refused", async () => {
    const stamp = await voce("8.2 Imposta di bollo");
    expect((await api.patch(`/api/cash/categories/${stamp.id}`, { scope: "ignore" })).status).toBe(204);
    expect((await voce("8.2 Imposta di bollo")).scope).toBe("ignore");
    expect((await api.patch(`/api/cash/categories/${stamp.id}`, { scope: "nowhere" })).status).toBe(400);
    const created = await api.post("/api/cash/categories", { name: "10. New Voce" });
    expect(created.body.scope).toBe("project");
    expect((await api.post("/api/cash/categories", { name: "11. Other", scope: "outside" })).body.scope).toBe("outside");
  });

  it("is kept by the treasury and the admins only", async () => {
    const stamp = await voce("8.2 Imposta di bollo");
    expect((await api.as(TREASURER).patch(`/api/cash/categories/${stamp.id}`, { scope: "project" })).status).toBe(204);
    expect((await api.as({ email: "pm@team.test", role: "pm" as const, areas: ["mt-dmt"] }).patch(`/api/cash/categories/${stamp.id}`, { scope: "ignore" })).status).toBe(403);
  });
});

describe("the derived area", () => {
  it("is the last area, marked as derived, and nothing can be added to it", async () => {
    const areas = (await api.get("/api/areas")).body as { code: string; derived: boolean }[];
    expect(areas.map((a) => a.code).at(-1)).toBe("administration");
    expect(areas.filter((a) => a.derived).map((a) => a.code)).toEqual(["administration"]);
    expect((await sheet()).area).toMatchObject({ code: "administration", derived: true });
    expect((await api.post("/api/projects", { areaCode: "administration", name: "Mine" })).status).toBe(403);
  });

  it("has a project for each section of the financial statement and a line for each Voce and month, from the register", async () => {
    const { startsOn, endsOn } = await season();
    await move("8.2 Imposta di bollo", -1_600, { on: startsOn });
    await move("8.2 Imposta di bollo", -400, { on: startsOn });
    await move("8.2 Imposta di bollo", -1_600, { on: endsOn });
    await move("2.1 Assicurazioni", -50_000, { on: today() });
    const area = await sheet();
    const names = area.projects.map((p: { name: string }) => p.name);
    expect(names).toEqual(["2. ACQUISTO DI SERVIZI", "8. IMPOSTE E TASSE"]);
    const stamp = area.projects[1].lines;
    expect(stamp.map((l: { item: string }) => l.item)).toEqual([`8.2 Imposta di bollo - ${month(startsOn)}`, `8.2 Imposta di bollo - ${month(endsOn)}`]);
    expect(stamp[0].actual.amounts).toMatchObject({ netCents: 2_000, vatCents: 0, grossCents: 2_000, outflowCents: 2_000, complete: true });
    expect(stamp[0]).toMatchObject({ category: "Administration", note: "2 movements in the register" });
    expect(stamp[0].estimate.amounts.outflowCents).toBe(0);
    expect(area.total.actual.outflowCents).toBe(53_600);
    expect(area.total.estimate.outflowCents).toBe(0);
  });

  it("puts a Voce the statement does not have in a last project of its own", async () => {
    await move("9.5 saldo fattura", -700);
    expect((await sheet()).projects.map((p: { name: string }) => p.name)).toEqual(["Voci not in the statement"]);
  });

  it("counts a refund against the cost of its month, and nothing when they cancel", async () => {
    await move("8.2 Imposta di bollo", -1_000);
    await move("8.2 Imposta di bollo", 300);
    await move("2.1 Assicurazioni", -500);
    await move("2.1 Assicurazioni", 500);
    expect(await lineNames()).toEqual([`8.2 Imposta di bollo - ${month(today())}`]);
    expect((await sheet()).total.actual.outflowCents).toBe(700);
  });

  it("does not count what is not outside the budget, what is tied to a line or an inflow, what is sponsorship or of another season", async () => {
    const { startsOn } = await season();
    const before = `${String(Number(startsOn.slice(0, 4)) - 1)}-12-31`;
    await move("1.1 Attrezzature", -100); // spent on a project: it counts through the line it is tied to
    await move("9.2 IVA a debito", -200); // ignored
    await move(null, -300); // no Voce
    await move("6.1 Da pubblicità e sponsorizzazioni", 400, { sponsorship: true });
    await move("1. QUOTE ASSOCIATIVE", 500, { sponsorship: true }); // outside the budget, but ticked as sponsorship: it is an inflow
    await move("8.2 Imposta di bollo", -600, { on: before }); // the season before
    expect(await lineNames()).toEqual([]);

    // an outside payment tied to a budget line counts as the line, not here
    const project = (await api.post("/api/projects", { areaCode: "mt-dmt", name: "Steering" })).body;
    const team = (await api.get("/api/funds")).body.find((f: { kind: string }) => f.kind === "team");
    const bought = (await api.post(`/api/projects/${project.id}/lines`, {
      item: "Sensor", figures: { actual: { quantity: 1, unitNetCost: "10", sponsorType: "none", vatRate: 0, fundIds: [team.id], purchaseDate: today() } },
    })).body;
    const stamp = await move("8.2 Imposta di bollo", -1_000);
    expect(await lineNames()).toEqual([`8.2 Imposta di bollo - ${month(today())}`]);
    expect((await api.put(`/api/cash/entries/${stamp.id}/lines`, { lines: [{ lineId: bought.id, amount: "10" }] })).status).toBe(204);
    expect(await lineNames()).toEqual([]);
    // and when the link goes, it is outside the budget again
    expect((await api.put(`/api/cash/entries/${stamp.id}/lines`, { lines: [] })).status).toBe(204);
    expect(await lineNames()).toEqual([`8.2 Imposta di bollo - ${month(today())}`]);
  });

  it("follows the scope: a Voce moved from outside the budget to a project leaves the area at once", async () => {
    await move("8.2 Imposta di bollo", -1_600);
    expect(await lineNames()).toHaveLength(1);
    await api.patch(`/api/cash/categories/${(await voce("8.2 Imposta di bollo")).id}`, { scope: "project" });
    expect(await lineNames()).toEqual([]);
    await api.patch(`/api/cash/categories/${(await voce("8.2 Imposta di bollo")).id}`, { scope: "outside" });
    expect(await lineNames()).toHaveLength(1);
  });

  it("cannot be written: its lines are not rows of the budget", async () => {
    await move("8.2 Imposta di bollo", -1_600);
    const line = (await sheet()).projects[0].lines[0];
    expect(line.id).toBeLessThan(0);
    expect([400, 404]).toContain((await api.patch(`/api/lines/${line.id}`, { item: "Mine", version: 0 })).status);
    expect([400, 404]).toContain((await api.del(`/api/lines/${line.id}`)).status);
  });
});

describe("in the views", () => {
  it("is a row of TOTAL, in ALL and in its category, and it adds to the total without a warning of a variance", async () => {
    await move("8.2 Imposta di bollo", -1_600);
    const { blocks } = (await api.get("/api/views/totals")).body;
    const rowOf = (name: string) => blocks.find((b: { block: string }) => b.block === name).rows.find((r: { areaCode: string }) => r.areaCode === "administration");
    expect(rowOf("ALL")).toMatchObject({ areaName: "ADMINISTRATION", actualOutflowCents: 1_600, estimateOutflowCents: 0, outflowVariance: null, outflowOutOfRange: false });
    expect(rowOf("ALL").projects.map((p: { name: string }) => p.name)).toEqual(["8. IMPOSTE E TASSE"]);
    expect(rowOf("Administration").actualOutflowCents).toBe(1_600);
    expect(rowOf("Asset").actualOutflowCents).toBe(0);
    expect(blocks.find((b: { block: string }) => b.block === "ALL").total.actualOutflowCents).toBe(1_600);
  });

  it("is in the TOTAL of the year, with the money that came in outside the budget, Voce by Voce", async () => {
    await move("8.2 Imposta di bollo", -1_600);
    await move("1. QUOTE ASSOCIATIVE", 2_500);
    await move("1. QUOTE ASSOCIATIVE", 1_500);
    const total = (await api.get(`/api/views/totals/year?year=${year}`)).body;
    expect(total.blocks[0].total.actualOutflowCents).toBe(1_600);
    expect(total.moneyIn.rows).toContainEqual({ kind: "register", label: "1. QUOTE ASSOCIATIVE", asOf: null, estimateCents: 0, actualCents: 4_000 });
    expect(total.moneyIn.total.actual).toBe(4_000);
  });

  it("does not count as money in what is ticked as sponsorship or has received an inflow: those are inflows already", async () => {
    const yearRows = async () => (await api.get(`/api/views/totals/year?year=${year}`)).body.moneyIn.rows.filter((r: { kind: string }) => r.kind === "register");
    await move("1. QUOTE ASSOCIATIVE", 500, { sponsorship: true });
    const received = await move("2.1 da soci e tesserati", 700);
    const expected = (await api.post("/api/inflows", { phase: "estimate", sourceName: "Acme", amount: "700", inflowDate: today(), sponsorship: false })).body;
    expect((await api.post(`/api/inflows/${expected.id}/receive`, { entryId: received.id })).status).toBeLessThan(300);
    expect(await yearRows()).toEqual([]);
    // the same money, tied to nothing, is a fee that came in outside the budget
    await move("2.1 da soci e tesserati", 900);
    expect((await yearRows()).map((r: { label: string; actualCents: number }) => [r.label, r.actualCents])).toEqual([["2.1 da soci e tesserati", 900]]);
  });

  it("does not change CASH FLOW: the team fund pays none of it, even after the BANK day", async () => {
    await api.put("/api/bank", { amount: "5000", asOfDate: "2020-01-01" });
    const cashFlow = async () => {
      const { bank, estimate, actual } = (await api.get("/api/views/cashflow")).body;
      return { bank, estimate, actual: actual };
    };
    const before = await cashFlow();
    const ganttBefore = (await api.get("/api/views/gantt?phase=actual")).body;
    await move("8.2 Imposta di bollo", -1_600);
    await move("2.1 Assicurazioni", -50_000);
    await move("1. QUOTE ASSOCIATIVE", 2_500);
    const after = await cashFlow();
    // the totals of the forecast and the inflows are the same (the table of months only grows: the area has months of its own)
    expect(after.actual.summary).toEqual(before.actual.summary);
    expect(after.estimate.summary).toEqual(before.estimate.summary);
    expect(after.actual.monthly).toEqual(before.actual.monthly);
    expect((await api.get("/api/views/gantt?phase=actual")).body.blocks.length).toBeGreaterThan(ganttBefore.blocks.length);
  });

  it("is not pending in the inventory and not to pay", async () => {
    await move("8.2 Imposta di bollo", -1_600);
    expect((await api.get("/api/inventory/pending")).body).toEqual([]);
    expect((await api.get("/api/cash/to-pay")).body.rows).toEqual([]);
  });
});

describe("the payments to tie to a line", () => {
  it("are only the ones a line can be for: a payment outside the budget is in the derived area, and an ignored one is nobody's", async () => {
    await move("8.2 Imposta di bollo", -100); // outside the budget
    await move("9.2 IVA a debito", -200); // ignored
    const onProject = await move("1.1 Attrezzature", -300);
    const noVoce = await move(null, -400);
    const toLink = (await api.get("/api/cash/to-link")).body as { id: number }[];
    expect(toLink.map((e) => e.id).sort()).toEqual([onProject.id, noVoce.id].sort());
  });
});
