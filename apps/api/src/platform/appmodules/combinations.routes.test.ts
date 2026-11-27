import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { today } from "../../core/today";
import { resetData, testApp } from "../../../test/helpers";

// Every combination of the four switches (docs/moduli-architettura.md, §12, «Le combinazioni»): the addresses of what is off answer
// 404, a read of everything that is on answers 200 (the budget's views compute the snapshot with or without the register and the
// inventory), the core always answers, and the boxes of Users are only those of the modules that are on. Built from the modules and the
// bridges the server declares: a new one cannot be added without its reads here.

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const ok = <T = any>(reply: { status: number; body: any }): T => {
  if (reply.status !== 200) throw new Error(`Expected 200, got ${reply.status}: ${JSON.stringify(reply.body)}`);
  return reply.body as T;
};

/** For each module and bridge, reads that go through what it asks of the others (the ports of the snapshot, of the register, of the statistics). */
const READS: Record<string, string[]> = {
  budget: ["/api/budget/views/cashflow", "/api/budget/views/totals", "/api/budget/areas/mt-dmt/sheet"],
  treasury: [`/api/treasury/register?year=${today().slice(0, 4)}`, "/api/treasury/statement"],
  inventory: ["/api/inventory/items", "/api/inventory/stats"],
  registry: ["/api/registry/tables"],
  "treasury-budget": ["/api/treasury-budget/to-pay"],
  "inventory-budget": ["/api/inventory-budget/pending"],
  "registry-access": ["/api/registry-access/role-sync"],
};
/** The core: it is never off. */
const CORE = ["/api/me", "/api/settings", "/api/areas", "/api/users", "/api/flags", "/api/audit"];

const turn = (key: string, enabled: boolean) => api.patch(`/api/modules/${key}`, { enabled });

describe("every combination of the switches of the modules", () => {
  it("has its reads here for every module and bridge the server declares", async () => {
    const me = ok(await api.get("/api/me"));
    expect(Object.keys(READS).sort()).toEqual([...Object.keys(me.modules), ...Object.keys(me.bridges)].sort());
  });

  it("answers 404 for what is off and 200 for what is on, the core always, in all 16", async () => {
    const modules = Object.keys(ok(await api.get("/api/me")).modules);
    expect(modules).toHaveLength(4);
    for (let mask = 0; mask < 2 ** modules.length; mask++) {
      const on = Object.fromEntries(modules.map((key, i) => [key, (mask & (1 << i)) === 0]));
      for (const key of modules) expect((await turn(key, on[key]!)).status).toBe(204);
      const me = ok(await api.get("/api/me"));
      expect(me.modules).toEqual(on);
      const seen: string[] = [];
      for (const [part, urls] of Object.entries(READS)) {
        const shouldAnswer = part in on ? on[part] : me.bridges[part];
        for (const url of urls) {
          const reply = await api.get(url);
          seen.push(`${url} ${reply.status}`);
          if (!shouldAnswer) expect(reply.body.code).toBe("module-off");
        }
        expect(seen.slice(-urls.length)).toEqual(urls.map((url) => `${url} ${shouldAnswer ? 200 : 404}`));
      }
      for (const url of CORE) expect(`${url} ${(await api.get(url)).status}`).toBe(`${url} 200`);
      // the boxes of a person are the modules': Treasury from the treasury, Sponsors from the budget
      const flags = ok<{ key: string }[]>(await api.get("/api/flags")).map((f) => f.key);
      expect(flags.sort()).toEqual([...(on.budget ? ["sponsors"] : []), ...(on.treasury ? ["treasury"] : [])].sort());
    }
  });

  it("turns a bridge off with either of its modules, and on again only when both are on", async () => {
    await turn("budget", false);
    expect(ok(await api.get("/api/me")).bridges).toEqual({ "treasury-budget": false, "inventory-budget": false, "registry-access": true });
    expect((await api.get("/api/treasury-budget/to-pay")).body).toEqual({ error: "The Budget module is turned off", code: "module-off" });
    await turn("treasury", false);
    await turn("budget", true);
    expect(ok(await api.get("/api/me")).bridges).toEqual({ "treasury-budget": false, "inventory-budget": true, "registry-access": true });
    expect((await api.get("/api/treasury-budget/to-pay")).body.error).toBe("The Treasury module is turned off");
    await turn("treasury", true);
    expect(ok(await api.get("/api/me")).bridges).toEqual({ "treasury-budget": true, "inventory-budget": true, "registry-access": true });
  });
});

describe("the numbers with a module off", () => {
  const later = (days: number) => new Date(new Date(`${today()}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  /** A line the team fund pays 1000 for (plus 22% VAT), to be bought in 20 days, and a payment of the register today that paid all of it. */
  async function paidLine() {
    await api.put("/api/treasury/openings", { year: Number(today().slice(0, 4)), account: "bank", amount: "5000" });
    const project = (await api.post("/api/budget/projects", { areaCode: "mt-dmt", name: "Steering" })).body;
    const team = ok<{ id: number; kind: string }[]>(await api.get("/api/budget/funds")).find((f) => f.kind === "team")!;
    const line = await api.post(`/api/budget/projects/${project.id}/lines`, {
      item: "Sensor",
      figures: { actual: { quantity: 1, unitNetCost: "1000", sponsorType: "none", vatRate: 22, fundIds: [team.id], purchaseDate: later(20) } },
    });
    const payment = await api.post("/api/treasury/entries", { on: today(), description: "Sensor", account: "bank", direction: "out", amount: "1220" });
    expect((await api.put(`/api/treasury-budget/entries/${payment.body.id}/lines`, { lines: [{ lineId: line.body.id, amount: "1220" }] })).status).toBe(204);
  }
  const outflows = async () => ok(await api.get("/api/budget/views/cashflow")).actual.summary.teamOutflowsCents as number;
  const bank = async () => ok(await api.get("/api/budget/bank")) as { source: string } | null;

  it("counts CASH FLOW as before the register while the treasury is off (the BANK by hand, nothing paid), and as now when it is on again", async () => {
    await paidLine();
    expect(await outflows()).toBe(0); // paid in full: the money has already left the BANK
    expect((await bank())?.source).toBe("register");

    await turn("treasury", false);
    expect(await outflows()).toBe(122_000); // nothing is known to be paid: the line still has to be paid, with its VAT
    expect((await bank())?.source).not.toBe("register");
    // the BANK can be written by hand by who kept the money: switches hide, they do not take permissions away
    expect((await api.put("/api/budget/bank", { amount: "4000", asOfDate: today() })).status).toBe(200);

    await turn("treasury", true);
    expect(await outflows()).toBe(0);
    expect((await bank())?.source).toBe("register");
  });

  it("has no ADMINISTRATION while the treasury is off: what is outside the budget comes from the register", async () => {
    const hasAdministration = async () => JSON.stringify(ok(await api.get("/api/budget/views/totals"))).includes('"administration"');
    expect(await hasAdministration()).toBe(true);
    await turn("treasury", false);
    expect(await hasAdministration()).toBe(false);
    await turn("treasury", true);
    expect(await hasAdministration()).toBe(true);
  });
});
