import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, testApp } from "../../../test/helpers";

// The orders of TO PAY (docs/registro-di-cassa.md, section 5.3): lines of the budget bought together. Who keeps the budget groups them (a user
// only the lines of their areas), the treasury and the admins group any line and pay them; an order is of one season and goes when it has no
// line left.

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const PM_MT: Person = { email: "pm-mt@team.test", role: "pm", areas: ["mt-dmt"] };
const TREASURER: Person = { email: "treasury@team.test", role: "pm", treasury: true };
const VIEWER: Person = { email: "viewer@team.test", role: "viewer" };

/** A line of `area` bought by the team fund (it is in TO PAY), in the season of `headers` (the one of today without). */
async function line(area: string, item: string, headers: Record<string, string> = {}) {
  const projects = (await api.get(`/api/budget/areas/${area}/sheet`, headers)).body.projects as { id: number }[];
  const projectId = projects[0]?.id ?? (await api.post("/api/budget/projects", { areaCode: area, name: `Parts ${area}` }, headers)).body.id;
  const team = ((await api.get("/api/budget/funds", headers)).body as { id: number; kind: string }[]).find((f) => f.kind === "team")!;
  const created = await api.post(
    `/api/budget/projects/${projectId}/lines`,
    { item, figures: { actual: { quantity: 1, unitNetCost: "100", sponsorType: "none", vatRate: 22, fundIds: [team.id], purchaseDate: "2026-10-01" } } },
    headers,
  );
  expect(created.status).toBe(201);
  return created.body.id as number;
}

const toPay = async (person?: Person) => (await (person ? api.as(person) : api).get("/api/treasury-budget/to-pay")).body;
const order = (body: object, person?: Person) => (person ? api.as(person) : api).post("/api/treasury-budget/orders", body);
const change = (id: number, body: object, person?: Person) => (person ? api.as(person) : api).patch(`/api/treasury-budget/orders/${id}`, body);
const ordersOf = async () => (await toPay()).orders.map((o: { name: string }) => o.name);
const orderOfLine = async (lineId: number) => (await toPay()).rows.find((r: { lineId: number }) => r.lineId === lineId)?.orderName ?? null;

describe("an order of TO PAY", () => {
  it("groups lines bought together: TO PAY says the order of each line, and the lines to pay of the register too", async () => {
    const [sensor, cable] = [await line("mt-dmt", "Sensor"), await line("hw", "Cable")];
    const created = await order({ name: "Amazon US", lineIds: [sensor, cable] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Amazon US" });

    const seen = await toPay();
    expect(seen.rows.filter((r: { orderName: string }) => r.orderName === "Amazon US").map((r: { lineId: number }) => r.lineId).sort()).toEqual([sensor, cable].sort());
    expect(seen.orders).toEqual([{ id: created.body.id, name: "Amazon US", seasonId: created.body.seasonId, canChange: true }]);
    const payable = (await api.get("/api/treasury-budget/payable-lines")).body as { lineId: number; orderName: string | null }[];
    expect(payable.find((l) => l.lineId === sensor)?.orderName).toBe("Amazon US");
  });

  it("is changed by who keeps the budget: a user groups the lines of their areas only, the treasury any line; a viewer none", async () => {
    const [sensor, pedal, cable] = [await line("mt-dmt", "Sensor"), await line("mt-dmt", "Pedal"), await line("hw", "Cable")];
    // a user sees every line of TO PAY, and which of them they may group
    const rows = (await toPay(PM_MT)).rows as { lineId: number; canGroup: boolean }[];
    expect(rows.map((r) => [r.lineId, r.canGroup]).sort()).toEqual([[sensor, true], [pedal, true], [cable, false]].sort());

    const refused = await order({ name: "Mixed", lineIds: [sensor, cable] }, PM_MT);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('You cannot change "Cable" (area HW)');
    expect((await order({ name: "Pedals", lineIds: [sensor, pedal] }, PM_MT)).status).toBe(201);
    expect((await order({ name: "Anything", lineIds: [sensor, pedal] }, VIEWER)).status).toBe(403);

    // the treasury groups lines of any area (it groups to pay); then the user cannot rename or ungroup that order, but can take their line out
    const mixed = await order({ name: "Amazon US", lineIds: [pedal, cable] }, TREASURER);
    expect(mixed.status).toBe(201);
    expect((await toPay(PM_MT)).orders.find((o: { name: string }) => o.name === "Amazon US").canChange).toBe(false);
    expect((await change(mixed.body.id, { name: "Amazon" }, PM_MT)).status).toBe(403);
    expect((await api.as(PM_MT).del(`/api/treasury-budget/orders/${mixed.body.id}`)).status).toBe(403);
    expect((await change(mixed.body.id, { name: "Amazon" }, TREASURER)).status).toBe(204);
    expect((await change(mixed.body.id, { removeLineIds: [pedal] }, PM_MT)).status).toBe(204);
    expect(await orderOfLine(pedal)).toBeNull();
  });

  it("moves a line to the order it is put in; an order left without lines goes, and ungrouping leaves the lines alone", async () => {
    const [a, b, c, d] = [await line("mt-dmt", "A"), await line("mt-dmt", "B"), await line("mt-dmt", "C"), await line("mt-dmt", "D")];
    const first = (await order({ name: "First", lineIds: [a, b] })).body;
    const second = (await order({ name: "Second", lineIds: [c, d] })).body;
    expect((await change(second.id, { addLineIds: [a] })).status).toBe(204);
    expect(await orderOfLine(a)).toBe("Second");
    expect(await ordersOf()).toEqual(["First", "Second"]);
    // a new order takes its lines from the orders they were in: First loses its last one and goes
    expect((await order({ name: "Third", lineIds: [b, c] })).status).toBe(201);
    expect(await ordersOf()).toEqual(["Second", "Third"]);
    expect((await change(first.id, { name: "Gone" })).status).toBe(404);
    // taking out the last lines takes the order away
    expect((await change(second.id, { removeLineIds: [a, d] })).status).toBe(204);
    expect(await ordersOf()).toEqual(["Third"]);
    // ungrouping: the lines stay, without an order
    const third = (await toPay()).orders[0].id as number;
    expect((await api.del(`/api/treasury-budget/orders/${third}`)).status).toBe(204);
    expect(await ordersOf()).toEqual([]);
    expect(await orderOfLine(b)).toBeNull();
    expect((await change(third, { removeLineIds: [b] })).status).toBe(404);
  });

  it("goes when the budget line that was its last one is deleted from the budget", async () => {
    const [a, b] = [await line("mt-dmt", "A"), await line("mt-dmt", "B")];
    const made = (await order({ name: "Only", lineIds: [a, b] })).body;
    await change(made.id, { removeLineIds: [b] });
    expect(await ordersOf()).toEqual(["Only"]);
    expect((await api.del(`/api/budget/lines/${a}`)).status).toBe(204);
    expect(await ordersOf()).toEqual([]);
  });

  it("refuses one line, a name already in the season (whatever the case), lines of different seasons, a line it does not have and a closed season", async () => {
    const [a, b, c] = [await line("mt-dmt", "A"), await line("mt-dmt", "B"), await line("mt-dmt", "C")];
    expect((await order({ name: "Alone", lineIds: [a] })).status).toBe(400);
    const made = (await order({ name: "Amazon US", lineIds: [a, b] })).body;
    const twice = await order({ name: "amazon us", lineIds: [b, c] });
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('There is already an order "amazon us"');
    expect((await change(made.id, { removeLineIds: [c] })).status).toBe(400);

    // a line of next season's budget cannot join an order of this one
    const next = (await api.post("/api/seasons", { startYear: 2027, car: "Car 2027-2028" })).body as { id: number };
    const later = await line("mt-dmt", "Later", { "x-season": String(next.id) });
    const mixed = await order({ name: "Two seasons", lineIds: [c, later] });
    expect(mixed.status).toBe(400);
    expect(mixed.body.error).toBe("Lines of different seasons cannot be one order");
    expect((await change(made.id, { addLineIds: [later] })).status).toBe(400);

    const current = (await api.get("/api/seasons/current")).body as { id: number };
    await api.patch(`/api/seasons/${current.id}`, { readOnly: true });
    expect((await change(made.id, { name: "Closed" })).status).toBe(409);
    expect((await order({ name: "Closed", lineIds: [b, c] })).status).toBe(409);
  });

  it("is written in the History, with its name and its lines", async () => {
    const [a, b] = [await line("mt-dmt", "A"), await line("mt-dmt", "B")];
    const made = (await order({ name: "Amazon US", lineIds: [a, b] })).body;
    await change(made.id, { name: "Amazon EU" });
    const orders = (await api.get("/api/audit?table=purchase_order")).body.entries as { action: string; label: string }[];
    expect(orders.map((e) => [e.action, e.label])).toEqual([["update", "order Amazon EU"], ["insert", "order Amazon US"]]);
    const lines = (await api.get("/api/audit?table=order_line")).body.entries as { label: string }[];
    expect(lines.map((e) => e.label).sort()).toEqual([`line ${a} in order ${made.id}`, `line ${b} in order ${made.id}`].sort());
  });
});
