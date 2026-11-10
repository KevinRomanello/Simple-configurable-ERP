import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { today } from "../../core/today";
import { resetData, testApp } from "../../../test/helpers";

// The register tied to the rest: an expected inflow that arrived, a payment that paid budget lines
// (docs/registro-di-cassa.md, section 5bis).

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const TREASURER = { email: "treasury@team.test", role: "pm" as const, treasury: true };
const PM = { email: "pm@team.test", role: "pm" as const, areas: ["mt-dmt"] };
const SP = { email: "sp@team.test", role: "pm" as const, sponsors: true };

const later = (days: number) => new Date(new Date(`${today()}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const year = Number(today().slice(0, 4));

/** The register starts with 1000 in the bank today, so the BANK is the register's. */
const openRegister = () => api.put("/api/cash/openings", { year, account: "bank", amount: "1000" });
const entry = async (body: object) => {
  const created = await api.post("/api/cash/entries", { on: today(), description: "x", account: "bank", direction: "in", amount: "10", ...body });
  expect(created.status).toBe(201);
  return created.body;
};
const inflow = async (body: object = {}) =>
  (await api.post("/api/inflows", { phase: "estimate", sourceName: "Acme", amount: "500", inflowDate: later(-5), sponsorship: true, ...body })).body;
const inflows = async (phase = "estimate") => (await api.get(`/api/inflows?phase=${phase}`)).body;
const cashFlow = async () => (await api.get("/api/views/cashflow")).body;
const register = async () => (await api.get(`/api/cash/register?year=${year}`)).body;

describe("an expected inflow that arrives", () => {
  it("is late while it has not, counted from the day after the BANK; received, it counts with the day and the amount of its movement", async () => {
    await openRegister();
    const gala = await inflow({ amount: "500", sponsorship: false });
    expect((await inflows())[0]).toMatchObject({ late: true, cashEntryId: null, receivedOn: null });
    expect((await cashFlow()).estimate.summary.totalCashFlowCents).toBe(100_000 + 50_000);

    // it came in two days ago, and 20 less than expected
    const received = await api.post(`/api/inflows/${gala.id}/receive`, { on: later(-2), account: "bank", amount: "480" });
    expect(received.status).toBe(204);
    expect((await inflows())[0]).toMatchObject({ late: false, receivedOn: later(-2), receivedAmount: "480.00", amount: "500.00" });
    // the movement is in the register and in the BANK: it is not counted a second time
    expect((await cashFlow()).bank.amountCents).toBe(100_000 + 48_000);
    expect((await cashFlow()).estimate.summary.totalCashFlowCents).toBe(100_000 + 48_000);
    const row = (await register()).entries.find((e: { description: string }) => e.description === "Acme");
    expect(row).toMatchObject({ cents: 48_000, sponsorship: false, inflow: { id: gala.id, sourceName: "Acme" } });
  });

  it("keeps owing the VAT of a sponsorship that has already reached the BANK", async () => {
    await openRegister();
    const gala = await inflow({ sponsorship: true });
    const before = (await cashFlow()).estimate.summary;
    await api.post(`/api/inflows/${gala.id}/receive`, { on: later(-2), account: "bank" });
    const after = (await cashFlow()).estimate.summary;
    // 11% of 500, due on the first day of the next quarter, which is after the BANK day
    expect(after.teamOutflowsCents).toBe(5_500);
    expect(after.totalCashFlowCents).toBe(before.totalCashFlowCents); // 1000 + 500 either way
  });

  it("can be tied to a movement that is already in the register, once, and only to money in", async () => {
    await openRegister();
    const a = await inflow({ sourceName: "A" });
    const b = await inflow({ sourceName: "B" });
    const wire = await entry({ on: later(-1), description: "Wire from A", amount: "500", sponsorship: true });
    const paid = await entry({ direction: "out", amount: "20" });

    expect((await api.get("/api/inflows/receivable")).body.map((e: { id: number }) => e.id)).toContain(wire.id);
    expect((await api.post(`/api/inflows/${a.id}/receive`, { entryId: wire.id })).status).toBe(204);
    expect((await api.get("/api/inflows/receivable")).body.map((e: { id: number }) => e.id)).not.toContain(wire.id);
    expect((await api.post(`/api/inflows/${b.id}/receive`, { entryId: wire.id })).status).toBe(409);
    expect((await api.post(`/api/inflows/${b.id}/receive`, { entryId: paid.id })).status).toBe(400);
    expect((await api.post(`/api/inflows/${b.id}/receive`, { entryId: 99_999 })).status).toBe(404);
    expect((await api.post(`/api/inflows/${a.id}/receive`, { on: today(), account: "cash" })).status).toBe(409); // already received
  });

  it("goes back to expected with Not received, and when its movement is deleted; the movement does not turn into a payment", async () => {
    await openRegister();
    const a = await inflow({ sourceName: "A" });
    const b = await inflow({ sourceName: "B" });
    const wire = await entry({ on: later(-1), amount: "500" });
    await api.post(`/api/inflows/${a.id}/receive`, { entryId: wire.id });
    expect((await api.patch(`/api/cash/entries/${wire.id}`, { direction: "out" })).status).toBe(409);

    expect((await api.del(`/api/inflows/${a.id}/receive`)).status).toBe(204);
    expect((await inflows()).find((i: { id: number }) => i.id === a.id)).toMatchObject({ cashEntryId: null, late: true });
    expect((await register()).entries.some((e: { id: number }) => e.id === wire.id)).toBe(true); // the movement stays

    await api.post(`/api/inflows/${b.id}/receive`, { on: later(-1), account: "cash" });
    const made = (await register()).entries.find((e: { inflow: unknown }) => e.inflow);
    expect((await api.del(`/api/cash/entries/${made.id}`)).status).toBe(204);
    expect((await inflows()).find((i: { id: number }) => i.id === b.id)).toMatchObject({ cashEntryId: null, late: true });
  });

  it("is received by the treasury and the admins only, and only on the expected side", async () => {
    await openRegister();
    const gala = await inflow();
    for (const person of [PM, SP]) {
      expect((await api.as(person).post(`/api/inflows/${gala.id}/receive`, { on: today(), account: "bank" })).status).toBe(403);
      expect((await api.as(person).get("/api/inflows/receivable")).status).toBe(403);
    }
    expect((await api.as(TREASURER).post(`/api/inflows/${gala.id}/receive`, { on: today(), account: "bank" })).status).toBe(204);

    // the money that arrived with the sponsorship box is also an actual inflow now, read from the register
    expect((await api.get("/api/inflows?phase=actual")).body).toMatchObject([{ sourceName: "Acme", source: "register" }]);
    expect((await api.post("/api/inflows/99999/receive", { on: today(), account: "bank" })).status).toBe(404);
    expect((await api.post(`/api/inflows/${gala.id}/receive`, { on: "nope", account: "bank" })).status).toBe(400);
    expect((await api.post(`/api/inflows/${gala.id}/receive`, {})).status).toBe(400);
  });

  it("is not a thing when the BANK is written by hand: the expected inflows count as they always did", async () => {
    await api.put("/api/bank", { amount: "100", asOfDate: later(-10) });
    await inflow({ amount: "500", inflowDate: later(-5) });
    expect((await inflows())[0]).toMatchObject({ late: false });
    expect((await cashFlow()).estimate.summary.totalCashFlowCents).toBe(10_000 + 50_000);
  });
});

describe("the actual side with the BANK from the register", () => {
  it("is the sponsorship money of the register in the season, read only; typed actual inflows are not used", async () => {
    await api.post("/api/inflows", { phase: "actual", sourceName: "Typed before", amount: "70" });
    await openRegister();
    await entry({ description: "Sponsor wire", amount: "300", sponsorship: true });
    await entry({ description: "Membership fee", amount: "40", sponsorship: false });
    await entry({ description: "Old wire", amount: "90", sponsorship: true, on: "2020-01-01" });
    await entry({ description: "Supplier", amount: "50", direction: "out" });

    const actual = await inflows("actual");
    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({ sourceName: "Sponsor wire", amount: "300.00", source: "register", inflowDate: today() });
    expect((await api.post("/api/inflows", { phase: "actual", sourceName: "X", amount: "1" })).status).toBe(400);
    expect((await api.post("/api/inflows", { phase: "estimate", sourceName: "X", amount: "1" })).status).toBe(201);
    // the VAT of the sponsorship that reached the register is owed, the fee owes none
    expect((await cashFlow()).actual.summary.teamOutflowsCents).toBe(3_300);
  });

  it("goes back to the typed inflows when the register cannot give the BANK", async () => {
    await api.post("/api/inflows", { phase: "actual", sourceName: "Typed", amount: "70" });
    expect((await inflows("actual")).map((i: { sourceName: string }) => i.sourceName)).toEqual(["Typed"]);
  });
});

describe("a payment that paid lines of the budget", () => {
  /** A line the team fund pays 1000 for (plus 22% VAT), bought on `purchaseDate`. */
  async function line(purchaseDate: string | null, item = "Sensor") {
    const { id } = (await api.get("/api/areas/mt-dmt/sheet")).body.projects[0] ?? (await api.post("/api/projects", { areaCode: "mt-dmt", name: "Steering" })).body;
    const team = (await api.get("/api/funds")).body.find((f: { kind: string }) => f.kind === "team");
    const created = await api.post(`/api/projects/${id}/lines`, {
      item,
      figures: { actual: { quantity: 1, unitNetCost: "1000", sponsorType: "none", vatRate: 22, fundIds: [team.id], ...(purchaseDate ? { purchaseDate } : {}) } },
    });
    expect(created.status).toBe(201);
    return created.body.id as number;
  }
  const outflows = async () => (await cashFlow()).actual.summary.teamOutflowsCents as number;
  const pay = (entryId: number, lines: { lineId: number; amount: string }[]) => api.put(`/api/cash/entries/${entryId}/lines`, { lines });

  it("makes a line count only what is still to pay, on its day if that is to come", async () => {
    await openRegister();
    const sensor = await line(later(20));
    const vat = 22_000;
    expect(await outflows()).toBe(100_000 + vat);

    const bill = await entry({ direction: "out", amount: "400", on: later(-1) });
    expect((await pay(bill.id, [{ lineId: sensor, amount: "400" }])).status).toBe(204);
    expect(await outflows()).toBe(60_000 + vat); // 600 still to pay; the VAT has its own deadline

    const rest = await entry({ direction: "out", amount: "600", on: today() });
    await pay(rest.id, [{ lineId: sensor, amount: "600" }]);
    expect(await outflows()).toBe(vat); // paid in full: the money has already left
  });

  it("counts what is left of a line that should have been paid already from the day after the BANK; a line without payments is as it was", async () => {
    await openRegister();
    const half = await line(later(-10), "Half paid");
    await line(later(-10), "Not linked");
    // both were bought before the BANK day: their purchases are in it already, only the VAT (on its deadline) is still to come
    const before = await outflows();
    const ganttTotal = async () =>
      ((await api.get("/api/views/gantt?phase=actual")).body.teamFund.rows as { outflowAllCents: number }[]).reduce((sum, r) => sum + r.outflowAllCents, 0);
    const ganttBefore = await ganttTotal();

    const bill = await entry({ direction: "out", amount: "400", on: later(-9) });
    await pay(bill.id, [{ lineId: half, amount: "400" }]);
    expect((await outflows()) - before).toBe(60_000); // 600 of "Half paid" has not left yet; "Not linked" stays as it was
    expect((await ganttTotal()) - ganttBefore).toBe(60_000);

    await pay(bill.id, []); // without the link it is as before again
    expect(await outflows()).toBe(before);
  });

  it("ignores the payments when the BANK is written by hand: they are not in it", async () => {
    await api.put("/api/bank", { amount: "100", asOfDate: later(-3) });
    const sensor = await line(later(20));
    await openRegister(); // the register has the BANK now; it is taken away again below
    const bill = await entry({ direction: "out", amount: "400", on: later(-1) });
    await pay(bill.id, [{ lineId: sensor, amount: "400" }]);
    await api.put("/api/cash/openings", { year, account: "bank", amount: null });
    expect((await api.get("/api/bank")).body.source).toBe("typed");
    expect(await outflows()).toBe(100_000 + 22_000);
  });

  it("shows the lines in the register and what is paid of each, and the payment is a link that goes with the movement", async () => {
    await openRegister();
    const sensor = await line(later(20));
    const bill = await entry({ direction: "out", amount: "400", on: later(-1) });
    await pay(bill.id, [{ lineId: sensor, amount: "250.50" }]);

    const row = (await register()).entries.find((e: { id: number }) => e.id === bill.id);
    expect(row.lines).toEqual([{ lineId: sensor, item: "Sensor", cents: 25_050 }]);
    expect((await api.get("/api/cash/payable-lines")).body).toEqual([
      { lineId: sensor, item: "Sensor", project: "Steering", teamFundCents: 100_000, paidCents: 25_050 },
    ]);

    await pay(bill.id, []); // taking the links away
    expect((await register()).entries.find((e: { id: number }) => e.id === bill.id).lines).toEqual([]);
    await pay(bill.id, [{ lineId: sensor, amount: "100" }]);
    expect((await api.del(`/api/cash/entries/${bill.id}`)).status).toBe(204);
    expect((await api.get("/api/cash/payable-lines")).body[0].paidCents).toBe(0);
  });

  it("refuses what does not add up: more than the payment, more than the line, money in, the same line twice, a line nobody pays", async () => {
    await openRegister();
    const sensor = await line(later(20));
    const other = await line(later(20), "Other");
    const bill = await entry({ direction: "out", amount: "400", on: later(-1) });
    const money = await entry({ amount: "400" });

    expect((await pay(bill.id, [{ lineId: sensor, amount: "250" }, { lineId: other, amount: "200" }])).status).toBe(400); // 450 > 400
    expect((await pay(bill.id, [{ lineId: sensor, amount: "100" }, { lineId: sensor, amount: "100" }])).status).toBe(400);
    expect((await pay(money.id, [{ lineId: sensor, amount: "100" }])).status).toBe(400);
    expect((await pay(bill.id, [{ lineId: 99_999, amount: "100" }])).status).toBe(400);
    expect((await pay(bill.id, [{ lineId: sensor, amount: "0" }])).status).toBe(400);
    expect((await pay(99_999, [{ lineId: sensor, amount: "1" }])).status).toBe(404);

    // two payments can share a line, but never above what the team fund pays of it
    await pay(bill.id, [{ lineId: sensor, amount: "400" }]);
    const big = await entry({ direction: "out", amount: "900", on: later(-1) });
    expect((await pay(big.id, [{ lineId: sensor, amount: "700" }])).status).toBe(400); // 400 + 700 > 1000
    expect((await pay(big.id, [{ lineId: sensor, amount: "600" }])).status).toBe(204);

    // a payment cannot shrink below its links, nor turn into money in
    expect((await api.patch(`/api/cash/entries/${bill.id}`, { amount: "300" })).status).toBe(409);
    expect((await api.patch(`/api/cash/entries/${bill.id}`, { direction: "in" })).status).toBe(409);
    expect((await api.patch(`/api/cash/entries/${bill.id}`, { amount: "450" })).status).toBe(200);
  });

  it("is for the treasury and the admins, and not for a closed season", async () => {
    await openRegister();
    const sensor = await line(later(20));
    const bill = await entry({ direction: "out", amount: "400", on: later(-1) });
    for (const person of [PM, SP]) {
      expect((await api.as(person).put(`/api/cash/entries/${bill.id}/lines`, { lines: [] })).status).toBe(403);
      expect((await api.as(person).get("/api/cash/payable-lines")).status).toBe(403);
    }
    expect((await api.as(TREASURER).put(`/api/cash/entries/${bill.id}/lines`, { lines: [{ lineId: sensor, amount: "10" }] })).status).toBe(204);

    const season = (await api.get("/api/seasons/current")).body;
    await api.patch(`/api/seasons/${season.id}`, { readOnly: true });
    expect((await pay(bill.id, [])).status).toBe(409);
  });
});
