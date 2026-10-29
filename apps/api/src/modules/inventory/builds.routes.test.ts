import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, testApp } from "../../../test/helpers";
import { db } from "../../db/client";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };

const makeItem = async (name: string, origin: "bought" | "made" = "bought") =>
  (await api.post("/api/inventory/items", { name, origin })).body as { id: number; name: string };
const buy = (itemId: number, quantity: string, unitNet: string, receivedOn: string, location = "s1-r1", spot = "") =>
  api.post("/api/inventory/receive", { itemId, quantity, unitNet, vatRate: 22, receivedOn, location, spot });
const addPart = (componentId: number, partId: number, quantity: string) =>
  api.post(`/api/inventory/components/${componentId}/parts`, { partId, quantity });
/** The project the pieces are made for (made once per test: the data is wiped before each one). */
const projectOf = async () => {
  const known = (await api.get("/api/inventory/projects")).body as { id: number }[];
  return known[0]?.id ?? ((await api.post("/api/projects", { areaCode: "sw", name: "Pedals" })).body.id as number);
};
const build = async (componentId: number, quantity: string, extra: object = {}) =>
  api.post("/api/inventory/builds", {
    componentId, quantity, projectId: await projectOf(), builtOn: "2026-10-10", fromLocation: "s1-r1", toLocation: "s2-r1", toSpot: "Box 1", ...extra,
  });
const stockOf = async (itemId: number) => (await api.get(`/api/inventory/items/${itemId}`)).body.stock.map((s: { location: string; spot: string; quantityMilli: number }) => [s.location, s.spot, s.quantityMilli / 1000]);
const detail = async (itemId: number, query = "") => (await api.get(`/api/inventory/items/${itemId}?${query}`)).body;
const priceOf = async (itemId: number, query: string) => (await api.get(`/api/inventory/items?${query}`)).body.find((i: { id: number }) => i.id === itemId);

/** pedal = 2 plates + 4 screws; plates 10.00 and screws 1.00 net (22% VAT), 20 and 100 of them on the shelf of s1-r1. */
async function workshop() {
  const plate = await makeItem("Plate");
  const screw = await makeItem("Screw");
  const pedal = await makeItem("Pedal", "made");
  await buy(plate.id, "20", "10", "2026-09-01");
  await buy(screw.id, "100", "1", "2026-09-01");
  await addPart(pedal.id, plate.id, "2");
  await addPart(pedal.id, screw.id, "4");
  return { plate, screw, pedal };
}

describe("making a made item", () => {
  it("takes the parts off the shelf and puts the pieces on it, with the cost of the day frozen", async () => {
    const { plate, screw, pedal } = await workshop();
    const made = await build(pedal.id, "3", { note: "First batch" });
    expect(made.status).toBe(201);
    expect(made.body.used).toBe(2);
    expect(made.body.movement).toMatchObject({ kind: "build", quantity: "3.000", location: "s2-r1", spot: "Box 1", unitNet: "24.0000", unitGross: "29.2800", unitTeam: "29.2800", note: "First batch" });

    expect(await stockOf(plate.id)).toEqual([["s1-r1", "", 14]]); // 20 - 3 x 2
    expect(await stockOf(screw.id)).toEqual([["s1-r1", "", 88]]); // 100 - 3 x 4
    expect(await stockOf(pedal.id)).toEqual([["s2-r1", "Box 1", 3]]);
    const uses = (await detail(plate.id)).movements.filter((m: { kind: string }) => m.kind === "use");
    expect(uses[0]).toMatchObject({ quantity: "6.000", note: "Used to build 3 × Pedal" });
  });

  it("keeps the cost of the pieces already made when a part gets dearer, and the next ones use the new price", async () => {
    const { plate, pedal } = await workshop();
    await build(pedal.id, "5", { builtOn: "2026-09-10" }); // 2 x 10 + 4 x 1 = 24.00 each
    await buy(plate.id, "20", "12", "2026-10-01"); // the plates go up to 12.00
    const old = "basis=net&method=last";
    // what is on the shelf is worth what it was built for; making one now would cost more
    expect((await priceOf(pedal.id, `${old}&on=2026-10-05`)).unitE4).toBe(240_000);
    expect((await api.get(`/api/inventory/components/${pedal.id}?${old}&on=2026-10-05`)).body.bom.unitE4).toBe(280_000);

    await build(pedal.id, "5", { builtOn: "2026-10-10" }); // the default reads the average of the plates (10 and 12 = 11.00): 2 x 11 + 4 x 1 = 26.00 each
    const history = (await detail(pedal.id, old)).history;
    expect(history.map((p: { on: string; quantityMilli: number }) => [p.on, p.quantityMilli / 1000])).toEqual([["2026-09-10", 5], ["2026-10-10", 5]]);
    expect(history[0].unitE4).toBe(240_000);
    expect(history[1].unitE4).toBe(260_000); // the first ones did not change: 24.00 on the shelf for those, 26.00 for these
    // 5 at 24.00 and 5 at 26.00: the shelf is worth 25.00 each by the average and 26.00 by the last price
    expect((await priceOf(pedal.id, "basis=net&method=average&on=2026-10-31")).unitE4).toBe(250_000);
    expect((await priceOf(pedal.id, "basis=net&method=last&on=2026-10-31")).unitE4).toBe(260_000);
  });

  it("reads the prices of the parts the way it is told: the average of the purchases, or the last one", async () => {
    const { plate, pedal } = await workshop();
    await buy(plate.id, "20", "12", "2026-10-01");
    const byAverage = await build(pedal.id, "1", { builtOn: "2026-10-10", method: "average" });
    expect(byAverage.body.movement.unitNet).toBe("26.0000"); // plates (20 x 10 + 20 x 12) / 40 = 11.00: 2 x 11 + 4 x 1
    const byLast = await build(pedal.id, "1", { builtOn: "2026-10-10", method: "last" });
    expect(byLast.body.movement.unitNet).toBe("28.0000"); // 2 x 12 + 4 x 1
  });

  it("reads the price on the day of the build, not today", async () => {
    const { plate, pedal } = await workshop();
    await buy(plate.id, "20", "12", "2026-10-01");
    const earlier = await build(pedal.id, "1", { builtOn: "2026-09-15", method: "last" });
    expect(earlier.body.movement.unitNet).toBe("24.0000"); // the plates were still 10.00 on that day
  });

  it("is worth what it costs to make until the first one is made", async () => {
    const { pedal } = await workshop();
    expect((await priceOf(pedal.id, "basis=net&method=last&on=2026-10-05")).unitE4).toBe(240_000);
    expect((await priceOf(pedal.id, "basis=net&method=last&on=2026-10-05")).valueCents).toBe(0); // none on the shelf
  });

  it("takes the parts from several spots of the place when one does not hold enough, and leaves the other places alone", async () => {
    const plate = await makeItem("Plate");
    const screw = await makeItem("Screw");
    const pedal = await makeItem("Pedal", "made");
    await addPart(pedal.id, plate.id, "2");
    await addPart(pedal.id, screw.id, "4");
    await buy(plate.id, "3", "10", "2026-09-01", "s1-r1", "Shelf A");
    await buy(plate.id, "5", "10", "2026-09-01", "s1-r1", "Shelf B");
    await buy(plate.id, "50", "10", "2026-09-01", "s1-r2", "Far away");
    await buy(screw.id, "100", "1", "2026-09-01");
    await build(pedal.id, "3"); // needs 6 plates: 3 on Shelf A and 3 on Shelf B
    expect(await stockOf(plate.id)).toEqual([["s1-r1", "Shelf B", 2], ["s1-r2", "Far away", 50]]);
  });

  it("is refused when the place does not hold enough, naming what is short, and records nothing", async () => {
    const { plate, screw, pedal } = await workshop();
    const refused = await build(pedal.id, "11"); // 22 plates and 44 screws: 20 and 100 are there
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/Not enough at Site 1 \/ Room 1/);
    expect(refused.body.error).toContain('22.000 pcs of "Plate" (20.000 there)');
    expect(refused.body.error).not.toContain("Screw");
    expect(await stockOf(plate.id)).toEqual([["s1-r1", "", 20]]);
    expect(await stockOf(screw.id)).toEqual([["s1-r1", "", 100]]);
    expect(await stockOf(pedal.id)).toEqual([]);
    expect((await build(pedal.id, "3", { fromLocation: "s1-r2" })).status).toBe(409); // the parts are in another place
  });

  it("does not let two builds take the same parts at the same moment", async () => {
    const { plate, pedal } = await workshop();
    await projectOf();
    await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`select pg_sleep(0.05)`))); // connections already open: only then do the requests overlap
    const both = await Promise.all([build(pedal.id, "7"), build(pedal.id, "7")]); // 14 plates each: 20 are there
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(plate.id)).toEqual([["s1-r1", "", 6]]);
  });

  it("takes a part that is itself made from the shelf: it has to be made first", async () => {
    const plate = await makeItem("Plate");
    const screw = await makeItem("Screw");
    const bracket = await makeItem("Bracket", "made");
    const pedal = await makeItem("Pedal", "made");
    await buy(plate.id, "20", "10", "2026-09-01");
    await buy(screw.id, "100", "1", "2026-09-01");
    await addPart(bracket.id, plate.id, "1");
    await addPart(bracket.id, screw.id, "6");
    await addPart(pedal.id, bracket.id, "1");
    await addPart(pedal.id, screw.id, "4");
    const early = await build(pedal.id, "2");
    expect(early.status).toBe(409);
    expect(early.body.error).toContain('"Bracket"');

    await build(bracket.id, "4", { toLocation: "s1-r1", toSpot: "" }); // 1 plate + 6 screws: 16.00 each
    const pedals = await build(pedal.id, "2");
    expect(pedals.status).toBe(201);
    expect(pedals.body.movement.unitNet).toBe("20.0000"); // a bracket as it was built (16.00) + 4 screws
    expect(await stockOf(bracket.id)).toEqual([["s1-r1", "", 2]]);
  });

  it("is refused for what cannot be built, and for a part nobody ever priced", async () => {
    const { plate, pedal } = await workshop();
    expect((await build(plate.id, "1")).status).toBe(400); // bought, not made
    const empty = await makeItem("Empty", "made");
    expect((await build(empty.id, "1")).body.error).toMatch(/no parts/);
    expect((await build(99_999, "1")).status).toBe(404);
    expect((await build(pedal.id, "0")).status).toBe(400);
    expect((await build(pedal.id, "1", { toLocation: "nowhere" })).status).toBe(400);
    expect((await build(pedal.id, "1", { builtOn: "2026-13-40" })).status).toBe(400);

    // stock that was only counted (no purchase, so no price)
    const gasket = await makeItem("Gasket");
    const seal = await makeItem("Seal", "made");
    await addPart(seal.id, gasket.id, "1");
    await api.post("/api/inventory/movements", { itemId: gasket.id, kind: "adjustment", counted: "5", occurredOn: "2026-10-01", location: "s1-r1", spot: "" });
    const unpriced = await build(seal.id, "1");
    expect(unpriced.status).toBe(409);
    expect(unpriced.body.error).toMatch(/No price is known for "Gasket"/);
    expect(await stockOf(gasket.id)).toEqual([["s1-r1", "", 5]]); // nothing was taken
  });

  it("is for those who keep the inventory", async () => {
    const { pedal } = await workshop();
    const projectId = await projectOf();
    expect((await api.as(viewer).post("/api/inventory/builds", { componentId: pedal.id, projectId, quantity: "1", builtOn: "2026-10-10", fromLocation: "s1-r1", toLocation: "s1-r1" })).status).toBe(403);
  });

  it("is made for a project, always: the parts are used for it and the build is linked to them", async () => {
    const { plate, pedal } = await workshop();
    const projectId = await projectOf();
    const without = await api.post("/api/inventory/builds", { componentId: pedal.id, quantity: "1", builtOn: "2026-10-10", fromLocation: "s1-r1", toLocation: "s1-r1" });
    expect(without.status).toBe(400);
    expect((await build(pedal.id, "1", { projectId: 99_999 })).status).toBe(404);
    expect(await stockOf(plate.id)).toEqual([["s1-r1", "", 20]]); // nothing was taken by the refused ones

    const made = await build(pedal.id, "3");
    expect(made.body.movement.projectId).toBe(projectId);
    const parts = (await detail(plate.id)).movements.find((m: { kind: string }) => m.kind === "use");
    expect(parts).toMatchObject({ quantity: "6.000", projectName: "Pedals", builtBy: made.body.movement.id });
    const piece = (await detail(pedal.id)).movements.find((m: { kind: string }) => m.kind === "build");
    expect(piece).toMatchObject({ projectName: "Pedals", builtBy: null });
  });

  it("counts the parts for the project once: using the finished pieces for it adds nothing", async () => {
    const { pedal } = await workshop();
    const projectId = await projectOf();
    await build(pedal.id, "5");
    const used = async () => (await api.get("/api/inventory/stats?by=project&basis=net")).body.rows.find((r: { label: string }) => r.label === "Pedals").usedCents;
    expect(await used()).toBe(5 * 2 * 1_000 + 5 * 4 * 100); // 10 plates at 10.00 and 20 screws at 1.00
    await api.post("/api/inventory/movements", { itemId: pedal.id, kind: "use", quantity: "5", occurredOn: "2026-10-20", location: "s2-r1", spot: "Box 1", projectId });
    expect(await used()).toBe(5 * 2 * 1_000 + 5 * 4 * 100); // the same: the cost was already in the parts
  });

  it("is not something that was bought: the statistics count the parts as used and the pieces as made", async () => {
    const { pedal } = await workshop();
    const before = (await api.get("/api/inventory/stats?by=category&basis=net")).body.rows;
    await build(pedal.id, "5");
    const after = (await api.get("/api/inventory/stats?by=category&basis=net")).body.rows;
    const sum = (rows: { boughtCents: number }[], key: "boughtCents" | "usedCents" | "stockCents") => rows.reduce((total, r) => total + (r as unknown as Record<string, number>)[key]!, 0);
    expect(sum(after, "boughtCents")).toBe(sum(before, "boughtCents")); // the same 400.00 + 100.00 bought
    expect(sum(after, "usedCents")).toBe(5 * 2 * 1_000 + 5 * 4 * 100); // 10 plates at 10.00 and 20 screws at 1.00
  });
});
