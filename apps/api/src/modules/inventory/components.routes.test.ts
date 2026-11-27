import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };

const makeItem = async (name: string, origin: "bought" | "made" = "bought", extra: object = {}) =>
  (await api.post("/api/inventory/items", { name, origin, ...extra })).body as { id: number; name: string };
const buy = (itemId: number, quantity: string, unitNet: string, receivedOn: string) =>
  api.post("/api/inventory/receive", { itemId, quantity, unitNet, vatRate: 22, receivedOn, location: "s1-r1" });
const addPart = (componentId: number, partId: number, quantity: string, note?: string) =>
  api.post(`/api/inventory/components/${componentId}/parts`, { partId, quantity, ...(note ? { note } : {}) });

/**
 *   bracket = 1 plate + 6 screws          pedal = 1 bracket + 4 screws + 2 plates
 *   screws: 0.10 in June, 0.20 in September     plates: 5 in June, 7 in September (net, 22% VAT)
 */
async function workshop() {
  const screw = await makeItem("Screw");
  const plate = await makeItem("Plate");
  const bracket = await makeItem("Bracket", "made");
  const pedal = await makeItem("Pedal", "made");
  await buy(screw.id, "100", "0.1", "2026-06-01");
  await buy(plate.id, "10", "5", "2026-06-01");
  await buy(screw.id, "100", "0.2", "2026-09-01");
  await buy(plate.id, "10", "7", "2026-09-01");
  await addPart(bracket.id, plate.id, "1");
  await addPart(bracket.id, screw.id, "6");
  await addPart(pedal.id, bracket.id, "1");
  await addPart(pedal.id, screw.id, "4");
  await addPart(pedal.id, plate.id, "2");
  return { screw, plate, bracket, pedal };
}
const cost = async (id: number, query: string) => (await api.get(`/api/inventory/components/${id}?${query}`)).body;

describe("what the things we make cost", () => {
  it("adds up the materials at the prices paid, a part that is itself made included", async () => {
    const { bracket, pedal } = await workshop();
    const june = await cost(pedal.id, "on=2026-06-30");
    expect(june.bom.lines.map((l: { name: string; quantityMilli: number; unitE4: number; totalCents: number }) => [l.name, l.quantityMilli / 1000, l.unitE4, l.totalCents])).toEqual([
      ["Bracket", 1, 56_000, 560], // 1 plate (5) + 6 screws (0.60)
      ["Screw", 4, 1_000, 40],
      ["Plate", 2, 50_000, 1_000],
    ]);
    expect(june.bom).toMatchObject({ unitE4: 160_000, totalCents: 1_600, complete: true });
    expect(june.notes).toEqual({});
    expect((await cost(bracket.id, "on=2026-06-30")).bom.unitE4).toBe(56_000);
  });

  it("follows the prices over time: today's cost and the month-by-month series", async () => {
    const { pedal } = await workshop();
    const september = await cost(pedal.id, "on=2026-09-30");
    expect(september.bom).toMatchObject({ unitE4: 230_000, totalCents: 2_300 }); // bracket 8.20 + screws 0.80 + plates 14
    expect(september.series.map((p: { on: string; unitE4: number }) => [p.on, p.unitE4])).toEqual([
      ["2026-06-30", 160_000], ["2026-07-31", 160_000], ["2026-08-31", 160_000], ["2026-09-30", 230_000],
    ]);
    // before the first purchase there is nothing to say
    expect((await cost(pedal.id, "on=2026-05-15")).series).toEqual([]);
  });

  it("gives the price of every part at each point of the series, to see what made the cost rise", async () => {
    const { pedal } = await workshop();
    const { series } = await cost(pedal.id, "on=2026-09-30");
    const parts = (point: { parts: { name: string; quantityMilli: number; unitE4: number }[] }) => point.parts.map((p) => [p.name, p.quantityMilli / 1000, p.unitE4]);
    expect(parts(series[0])).toEqual([["Bracket", 1, 56_000], ["Screw", 4, 1_000], ["Plate", 2, 50_000]]); // June
    expect(parts(series[3])).toEqual([["Bracket", 1, 82_000], ["Screw", 4, 2_000], ["Plate", 2, 70_000]]); // September: all three got dearer
  });

  it("lets the price be net, with VAT or what the team pays, by the last purchase or the average", async () => {
    const { pedal } = await workshop();
    expect((await cost(pedal.id, "basis=gross&on=2026-06-30")).bom.unitE4).toBe(195_200); // 16.00 + 22%
    expect((await cost(pedal.id, "method=average&on=2026-09-30")).bom.unitE4).toBe(195_000); // plates 6, screws 0.15
    expect((await cost(pedal.id, "basis=team&method=average&on=2026-09-30")).bom.unitE4).toBe(237_900); // average gross
    expect((await api.get(`/api/inventory/components/${pedal.id}?basis=cash`)).status).toBe(400);
  });

  it("says when a material was never bought: the rest is added up, the cost is marked incomplete", async () => {
    const { bracket, pedal } = await workshop();
    const mystery = await makeItem("Mystery glue");
    await addPart(bracket.id, mystery.id, "2");
    const result = await cost(bracket.id, "on=2026-06-30");
    expect(result.bom).toMatchObject({ unitE4: 56_000, complete: false });
    expect(result.bom.lines.find((l: { name: string }) => l.name === "Mystery glue")).toMatchObject({ unitE4: null, totalCents: null });
    expect((await cost(pedal.id, "on=2026-06-30")).bom.complete).toBe(false); // the pedal contains the bracket
  });

  it("lists the things we make with their cost, and how many of them are on the shelf", async () => {
    const { bracket } = await workshop();
    await api.post("/api/inventory/movements", { itemId: bracket.id, kind: "adjustment", counted: "3", occurredOn: "2026-10-01", location: "s1-r1" });
    const list = (await api.get("/api/inventory/components?on=2026-06-30")).body;
    expect(list.map((c: { name: string }) => c.name)).toEqual(["Bracket", "Pedal"]);
    expect(list[0]).toMatchObject({ partsCount: 2, unitE4: 56_000, complete: true, onHandMilli: 3_000 });
    expect(list[1]).toMatchObject({ partsCount: 3, unitE4: 160_000 });
    // the item list gives the same cost for a made item as for a bought one
    const row = (await api.get("/api/inventory/items?origin=made&on=2026-06-30")).body.find((i: { name: string }) => i.name === "Bracket");
    expect(row).toMatchObject({ unitE4: 56_000, onHandMilli: 3_000, valueCents: 1_680 }); // 3 x 5.60
  });

  it("shows on a bought item which things it goes into", async () => {
    const { screw } = await workshop();
    const detail = (await api.get(`/api/inventory/items/${screw.id}`)).body;
    expect(detail.usedIn.map((u: { name: string }) => u.name).sort()).toEqual(["Bracket", "Pedal"]);
    expect(detail.bom).toBeNull();
  });
});

describe("editing the bill of materials", () => {
  it("adds, changes and removes parts", async () => {
    const screw = await makeItem("Screw");
    const bracket = await makeItem("Bracket", "made");
    expect((await addPart(bracket.id, screw.id, "6.5", "M3 x 10")).status).toBe(201);
    expect((await cost(bracket.id, "")).notes).toEqual({ [screw.id]: "M3 x 10" });
    expect((await api.patch(`/api/inventory/components/${bracket.id}/parts/${screw.id}`, { quantity: "8" })).body.quantity).toBe("8.000");
    expect((await api.patch(`/api/inventory/components/${bracket.id}/parts/${screw.id}`, { note: "" })).body.note).toBeNull();
    expect((await api.del(`/api/inventory/components/${bracket.id}/parts/${screw.id}`)).status).toBe(204);
    expect((await api.del(`/api/inventory/components/${bracket.id}/parts/${screw.id}`)).status).toBe(404);
    expect((await api.patch(`/api/inventory/components/${bracket.id}/parts/${screw.id}`, { quantity: "1" })).status).toBe(404);
  });

  it("refuses what makes no sense", async () => {
    const screw = await makeItem("Screw");
    const plate = await makeItem("Plate");
    const bracket = await makeItem("Bracket", "made");
    expect((await addPart(screw.id, plate.id, "1")).status).toBe(400); // a bought item has no parts
    expect((await addPart(bracket.id, 9999, "1")).status).toBe(404);
    expect((await addPart(9999, screw.id, "1")).status).toBe(404);
    expect((await addPart(bracket.id, bracket.id, "1")).status).toBe(400);
    expect((await addPart(bracket.id, screw.id, "0")).status).toBe(400);
    expect((await addPart(bracket.id, screw.id, "1000001")).status).toBe(400);
    expect((await api.patch(`/api/inventory/components/${bracket.id}/parts/${screw.id}`, { quantity: "0" })).status).toBe(400);
    await addPart(bracket.id, screw.id, "2");
    const twice = await addPart(bracket.id, screw.id, "3");
    expect(twice.status).toBe(409);
    expect(twice.body.error).toMatch(/already in the list/);
  });

  it("never lets a thing contain itself, however far down", async () => {
    const screw = await makeItem("Screw");
    const a = await makeItem("A", "made");
    const b = await makeItem("B", "made");
    const c = await makeItem("C", "made");
    await addPart(a.id, b.id, "1");
    await addPart(b.id, c.id, "1");
    await addPart(c.id, screw.id, "1");
    const loop = await addPart(c.id, a.id, "1"); // A contains B contains C: C cannot contain A
    expect(loop.status).toBe(409);
    expect(loop.body.error).toMatch(/cannot also be a part/);
    expect((await addPart(b.id, a.id, "1")).status).toBe(409);
    expect((await addPart(a.id, c.id, "1")).status).toBe(201); // a shortcut down the same tree is not a loop
  });

  it("deleting a made item takes its list of parts with it; its parts stay", async () => {
    const screw = await makeItem("Screw");
    const bracket = await makeItem("Bracket", "made");
    await addPart(bracket.id, screw.id, "2");
    expect((await api.del(`/api/inventory/items/${bracket.id}`)).status).toBe(204);
    expect((await api.get(`/api/inventory/items/${screw.id}`)).body.usedIn).toEqual([]);
  });

  it("only knows about things the team makes", async () => {
    const screw = await makeItem("Screw");
    const refused = await api.get(`/api/inventory/components/${screw.id}`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/not something the team makes/);
    expect((await api.get("/api/inventory/components/9999")).status).toBe(404);
  });

  it("is open to look at and closed to change for a viewer", async () => {
    const { pedal, screw } = await workshop();
    const as = api.as(viewer);
    expect((await as.get(`/api/inventory/components/${pedal.id}`)).status).toBe(200);
    expect((await as.post(`/api/inventory/components/${pedal.id}/parts`, { partId: screw.id, quantity: "1" })).status).toBe(403);
    expect((await as.patch(`/api/inventory/components/${pedal.id}/parts/${screw.id}`, { quantity: "9" })).status).toBe(403);
    expect((await as.del(`/api/inventory/components/${pedal.id}/parts/${screw.id}`)).status).toBe(403);
  });
});

describe("two people editing the same list at once", () => {
  it("cannot make a loop between them", async () => {
    const a = await makeItem("A", "made");
    const b = await makeItem("B", "made");
    const answers = await Promise.all([addPart(a.id, b.id, "1"), addPart(b.id, a.id, "1")]);
    expect(answers.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await api.get(`/api/inventory/components/${a.id}`)).status).toBe(200); // and nothing blows up when costed
    expect((await api.get(`/api/inventory/components/${b.id}`)).status).toBe(200);
  });
});

describe("how many can be made, and what a job would take", () => {
  /** The shelf of s1-r1: 100 + 100 screws, 10 + 10 plates, no brackets (a pedal is 1 bracket + 4 screws + 2 plates, a bracket 1 plate + 6 screws). */
  const plan = async (id: number, query: string) => (await api.get(`/api/inventory/components/${id}/plan?${query}`)).body;
  type PlanLine = { name: string; takes: unknown[]; places: { location: string }[] } & Record<string, unknown>;
  const line = (body: { lines: PlanLine[] }, name: string) => body.lines.find((l) => l.name === name)!;

  it("says per part what is needed, what is there, what is left and what is missing", async () => {
    const { bracket } = await workshop();
    const result = await plan(bracket.id, "quantity=3");
    expect(result).toMatchObject({ quantityMilli: 3_000, enough: true, unit: "pcs" });
    expect(line(result, "Plate")).toMatchObject({ neededMilli: 3_000, availableMilli: 20_000, leftMilli: 17_000, missingMilli: 0 });
    expect(line(result, "Screw")).toMatchObject({ neededMilli: 18_000, availableMilli: 200_000, leftMilli: 182_000, missingMilli: 0 });

    const tooMany = await plan(bracket.id, "quantity=25");
    expect(tooMany.enough).toBe(false);
    expect(line(tooMany, "Plate")).toMatchObject({ neededMilli: 25_000, availableMilli: 20_000, leftMilli: 0, missingMilli: 5_000 });
    expect(line(tooMany, "Screw")).toMatchObject({ missingMilli: 0 });
    expect(tooMany.maxMilli).toBe(20_000); // plates stop the 21st
    expect(tooMany.limitedBy.map((p: { name: string }) => p.name)).toEqual(["Plate"]);
    expect((await plan(bracket.id, "")).quantityMilli).toBe(1_000); // one when not asked
  });

  it("counts to the thousandth: 2.2 needed means at least 2.2 on the shelf", async () => {
    const foam = await makeItem("Foam", "bought", { unit: "kg" });
    const panel = await makeItem("Panel", "made", { unit: "pcs" });
    await buy(foam.id, "2.199", "10", "2026-09-01");
    await addPart(panel.id, foam.id, "1.1");
    const short = await plan(panel.id, "quantity=2");
    expect(short.enough).toBe(false);
    expect(line(short, "Foam")).toMatchObject({ neededMilli: 2_200, availableMilli: 2_199, missingMilli: 1 });
    expect(short.maxMilli).toBe(1_999); // 1.999 x 1.1 = 2.1989 -> 2.199 (the build rounds to the thousandth, as this does)

    await buy(foam.id, "0.001", "10", "2026-09-02");
    const enough = await plan(panel.id, "quantity=2");
    expect(enough.enough).toBe(true);
    expect(line(enough, "Foam")).toMatchObject({ neededMilli: 2_200, availableMilli: 2_200, leftMilli: 0 });
    expect((await plan(panel.id, "quantity=2.5")).enough).toBe(false);
    expect((await plan(panel.id, "quantity=0.5")).enough).toBe(true); // pieces too can be fractions: half a panel
  });

  it("reads every place together and says where each part would be taken from, the place with the most first", async () => {
    const { bracket, plate, screw } = await workshop(); // 20 plates and 200 screws in s1-r1
    await api.post("/api/inventory/receive", { itemId: plate.id, quantity: "50", unitNet: "5", vatRate: 22, receivedOn: "2026-09-03", location: "s2-r1" });
    await buy(screw.id, "200", "0.2", "2026-09-04");
    const result = await plan(bracket.id, "quantity=60"); // 60 plates and 360 screws
    expect(result.enough).toBe(true);
    const plates = line(result, "Plate");
    expect(plates).toMatchObject({ neededMilli: 60_000, availableMilli: 70_000, missingMilli: 0, takeFrom: null });
    expect(plates.places).toEqual([{ location: "s2-r1", quantityMilli: 50_000 }, { location: "s1-r1", quantityMilli: 20_000 }]);
    expect(plates.takes).toEqual([{ location: "s2-r1", spot: "", quantityMilli: 50_000 }, { location: "s1-r1", spot: "", quantityMilli: 10_000 }]);
    expect(line(result, "Screw").takes).toEqual([{ location: "s1-r1", spot: "", quantityMilli: 360_000 }]);
  });

  it("takes a part from one place only when told: what that place does not hold is missing, even if other places have it", async () => {
    const { bracket, plate, screw } = await workshop();
    await api.post("/api/inventory/receive", { itemId: plate.id, quantity: "50", unitNet: "5", vatRate: 22, receivedOn: "2026-09-03", location: "s2-r1" });
    await buy(screw.id, "200", "0.2", "2026-09-04"); // 400 screws: enough for 60
    const there = await plan(bracket.id, `quantity=60&from=${plate.id}:s1-r1`);
    expect(there.enough).toBe(false);
    expect(line(there, "Plate")).toMatchObject({ availableMilli: 20_000, missingMilli: 40_000, takeFrom: "s1-r1" });
    expect(line(there, "Plate").takes).toEqual([{ location: "s1-r1", spot: "", quantityMilli: 20_000 }]);
    expect(line(there, "Plate").places.map((p: { location: string }) => p.location)).toEqual(["s2-r1", "s1-r1"]); // the choices stay all there
    expect(there.maxMilli).toBe(20_000); // the choice counts for the most that can be made too
    const nowhere = await plan(bracket.id, `quantity=1&from=${plate.id}:s1-r5`);
    expect(line(nowhere, "Plate")).toMatchObject({ availableMilli: 0, missingMilli: 1_000, takes: [] });
    // the screws are not told where, so they are read wherever they are
    expect(line(there, "Screw")).toMatchObject({ takeFrom: null, missingMilli: 0 });
  });

  it("makes the sub-assemblies first when the shelf has too few, and uses the ones it has", async () => {
    const { pedal, bracket } = await workshop();
    const first = await plan(pedal.id, "quantity=2");
    // 2 pedals = 2 brackets (none on the shelf: made first, from 2 plates + 12 screws) + 8 screws + 4 plates
    expect(line(first, "Bracket")).toMatchObject({ neededMilli: 2_000, availableMilli: 0, makeFirstMilli: 2_000, missingMilli: 0 });
    expect(line(first, "Plate")).toMatchObject({ neededMilli: 6_000, missingMilli: 0 });
    expect(line(first, "Screw")).toMatchObject({ neededMilli: 20_000, missingMilli: 0 });
    expect(first.enough).toBe(true);

    await api.post("/api/inventory/movements", { itemId: bracket.id, kind: "adjustment", counted: "1", occurredOn: "2026-10-01", location: "s1-r1" });
    const some = await plan(pedal.id, "quantity=2");
    expect(line(some, "Bracket")).toMatchObject({ neededMilli: 2_000, availableMilli: 1_000, makeFirstMilli: 1_000 });
    expect(line(some, "Plate")).toMatchObject({ neededMilli: 5_000 }); // 1 for the bracket still to make + 4
  });

  it("lists how many of each can be made now, and what stops the next one", async () => {
    const { pedal } = await workshop();
    const list = (await api.get("/api/inventory/components?on=2026-06-30")).body;
    const row = (name: string) => list.find((c: { name: string }) => c.name === name);
    expect(row("Bracket")).toMatchObject({ canMakeMilli: 20_000, limitedBy: ["Plate"] }); // 20 plates, 200 screws / 6 = 33
    // a pedal: 1 bracket (made from 1 plate + 6 screws) + 4 screws + 2 plates = 3 plates, 10 screws -> 6 pedals by plates (20 / 3)
    expect(row("Pedal")).toMatchObject({ canMakeMilli: 6_666, limitedBy: ["Plate"] });
    expect(pedal.id).toBeGreaterThan(0);
  });

  it("can make none when there is nothing, and none of what has no parts", async () => {
    const screw = await makeItem("Screw");
    const empty = await makeItem("Empty", "made");
    const bracket = await makeItem("Bracket", "made");
    await addPart(bracket.id, screw.id, "6");
    const list = (await api.get("/api/inventory/components")).body;
    expect(list.find((c: { name: string }) => c.name === "Bracket")).toMatchObject({ canMakeMilli: 0, limitedBy: ["Screw"] });
    expect(list.find((c: { name: string }) => c.name === "Empty")).toMatchObject({ canMakeMilli: 0, limitedBy: [] });
    const nothing = await plan(empty.id, "quantity=1");
    expect(nothing).toMatchObject({ enough: false, lines: [] }); // nothing to make it from is nothing that can be made
  });

  it("gives what is on the shelf of each part on the page of the component", async () => {
    const { pedal, bracket, screw, plate } = await workshop();
    const detail = (await api.get(`/api/inventory/components/${pedal.id}`)).body;
    expect(detail.available).toEqual({ [bracket.id]: 0, [screw.id]: 200_000, [plate.id]: 20_000 });
    // and how many can be made, the number of the card on that page: the same as in the list
    expect(detail).toMatchObject({ canMakeMilli: 6_666, limitedBy: ["Plate"] });
  });

  it("refuses what makes no sense, and is open to a viewer", async () => {
    const { pedal, screw } = await workshop();
    expect((await api.get(`/api/inventory/components/${screw.id}/plan`)).status).toBe(400);
    expect((await api.get("/api/inventory/components/9999/plan")).status).toBe(404);
    expect((await api.get(`/api/inventory/components/${pedal.id}/plan?quantity=0`)).status).toBe(400);
    expect((await api.get(`/api/inventory/components/${pedal.id}/plan?quantity=abc`)).status).toBe(400);
    expect((await api.get(`/api/inventory/components/${pedal.id}/plan?quantity=-1`)).status).toBe(400);
    expect((await api.get(`/api/inventory/components/${pedal.id}/plan?from=plate`)).status).toBe(400); // a part id, then the place
    expect((await api.get(`/api/inventory/components/${pedal.id}/plan?from=12`)).status).toBe(400);
    expect((await api.as(viewer).get(`/api/inventory/components/${pedal.id}/plan?quantity=2`)).status).toBe(200);
    expect((await api.as(viewer).get("/api/inventory/components?quantity=2")).status).toBe(200);
  });
});

describe("what «Make new» starts from, set when the item is created", () => {
  const project = async () => (await api.post("/api/projects", { areaCode: "sw", name: "Pedals" })).body.id as number;

  it("keeps the project and the places on an item made by the team, and changes them later", async () => {
    const id = await project();
    const made = await makeItem("Bracket", "made", { makeProjectId: id, makeTo: "s2-r1", makeToSpot: "Box 1" });
    expect(made).toMatchObject({ makeProjectId: id, makeTo: "s2-r1", makeToSpot: "Box 1" });
    expect((await api.get(`/api/inventory/items/${made.id}`)).body.item).toMatchObject({ makeProjectId: id, makeTo: "s2-r1", makeToSpot: "Box 1" });

    const changed = await api.patch(`/api/inventory/items/${made.id}`, { makeTo: null, makeToSpot: "" });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ makeProjectId: id, makeTo: null, makeToSpot: "" });
  });

  it("starts with nothing set", async () => {
    expect(await makeItem("Bracket", "made")).toMatchObject({ makeProjectId: null, makeTo: null, makeToSpot: "" });
  });

  it("refuses them on a bought item, on an unknown project and on an unknown place", async () => {
    const id = await project();
    const bought = await makeItem("Screw");
    const bracket = await makeItem("Bracket", "made");
    expect((await api.post("/api/inventory/items", { name: "Nut", makeTo: "s1-r1" })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { name: "Nut", makeProjectId: id })).status).toBe(400);
    const onBought = await api.patch(`/api/inventory/items/${bought.id}`, { makeToSpot: "Box 1" });
    expect(onBought.status).toBe(400);
    expect(onBought.body.error).toMatch(/made by the team/);
    expect((await api.patch(`/api/inventory/items/${bracket.id}`, { makeProjectId: 9999 })).status).toBe(400);
    expect((await api.patch(`/api/inventory/items/${bracket.id}`, { makeTo: "nowhere" })).status).toBe(400);
    // clearing them on a bought item is not setting them
    expect((await api.patch(`/api/inventory/items/${bought.id}`, { makeTo: null, makeToSpot: "" })).status).toBe(200);
  });

  it("forgets the project when it is deleted", async () => {
    const id = await project();
    const made = await makeItem("Bracket", "made", { makeProjectId: id });
    expect((await api.del(`/api/projects/${id}`)).status).toBe(204);
    expect((await api.get(`/api/inventory/items/${made.id}`)).body.item.makeProjectId).toBeNull();
  });
});

describe("finding a component", () => {
  const categoryId = async () => ((await api.get("/api/settings")).body.categories as { id: number; name: string }[]).find((c) => c.name === "Components")!.id;
  const areaId = async (code: string) => ((await api.get("/api/areas")).body as { id: number; code: string }[]).find((a) => a.code === code)!.id;
  const names = async (query: string) => ((await api.get(`/api/inventory/components?${query}`)).body as { name: string }[]).map((c) => c.name);

  /** Harness (HW, type Harness > Dash, project Brakes), Bracket (SW, type Bracket), Pedal (no area, no type, no project) and a bought Screw. */
  async function catalogue() {
    const category = await categoryId();
    const harness = (await api.post("/api/inventory/types", { name: "Harness", categoryId: category })).body.id as number;
    const dash = (await api.post("/api/inventory/types", { name: "Dash", parentId: harness, categoryId: category })).body.id as number;
    const bracketType = (await api.post("/api/inventory/types", { name: "Bracket", categoryId: category })).body.id as number;
    const brakes = (await api.post("/api/projects", { areaCode: "sw", name: "Brakes" })).body.id as number;
    const cooling = (await api.post("/api/projects", { areaCode: "sw", name: "Cooling" })).body.id as number;
    await makeItem("Dash harness", "made", { areaId: await areaId("hw"), typeId: dash, makeProjectId: brakes, purpose: "Wires the dashboard" });
    await makeItem("Bracket A", "made", { areaId: await areaId("sw"), typeId: bracketType, makeProjectId: cooling, code: "BR-A" });
    await makeItem("Pedal", "made");
    await makeItem("Screw", "bought", { areaId: await areaId("hw"), typeId: dash, makeProjectId: undefined });
    return { harness, dash, bracketType, brakes, cooling };
  }

  it("lists them all when nothing is asked, bought items never", async () => {
    await catalogue();
    expect(await names("")).toEqual(["Bracket A", "Dash harness", "Pedal"]);
  });

  it("by name, code or what it is for, without minding capitals", async () => {
    await catalogue();
    expect(await names("search=BRACK")).toEqual(["Bracket A"]);
    expect(await names("search=br-a")).toEqual(["Bracket A"]);
    expect(await names("search=dashboard")).toEqual(["Dash harness"]);
    expect(await names("search=nothing")).toEqual([]);
  });

  it("by area, an unknown area finding nothing", async () => {
    await catalogue();
    expect(await names("area=hw")).toEqual(["Dash harness"]);
    expect(await names("area=sw")).toEqual(["Bracket A"]);
    expect(await names("area=nowhere")).toEqual([]);
  });

  it("by type, the types under it included", async () => {
    const { harness, dash, bracketType } = await catalogue();
    expect(await names(`type=${dash}`)).toEqual(["Dash harness"]);
    expect(await names(`type=${harness}`)).toEqual(["Dash harness"]); // the kinds of Harness are Harness too
    expect(await names(`type=${bracketType}`)).toEqual(["Bracket A"]);
    expect(await names("type=99999")).toEqual([]);
  });

  it("by the project it is usually made for", async () => {
    const { brakes, cooling } = await catalogue();
    expect(await names(`project=${brakes}`)).toEqual(["Dash harness"]);
    expect(await names(`project=${cooling}`)).toEqual(["Bracket A"]);
    expect(await names("project=99999")).toEqual([]);
  });

  it("with the filters together, and the numbers still those of the whole shelf", async () => {
    const { dash, brakes, cooling } = await catalogue();
    expect(await names(`area=hw&type=${dash}&project=${brakes}`)).toEqual(["Dash harness"]);
    expect(await names(`area=sw&type=${dash}`)).toEqual([]);
    expect(await names(`area=hw&project=${cooling}`)).toEqual([]);
    expect(await names(`search=harness&area=hw&project=${brakes}`)).toEqual(["Dash harness"]);
    expect(await names(`search=bracket&area=hw`)).toEqual([]);
  });

  it("refuses what is not a filter, and is open to a viewer", async () => {
    await catalogue();
    expect((await api.get("/api/inventory/components?type=abc")).status).toBe(400);
    expect((await api.get("/api/inventory/components?project=0")).status).toBe(400);
    expect((await api.as(viewer).get("/api/inventory/components?area=hw")).status).toBe(200);
  });
});

describe("statistics", () => {
  /** A purchase of the budget (10 sensors at 5 euros net), 4 of them arrived; a gift of glue; one sensor used. */
  async function scene() {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "Brakes" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, { item: "Sensor", category: "Components" })).body;
    await api.patch(`/api/lines/${line.id}`, {
      version: 1,
      figures: { actual: { quantity: 10, unitNetCost: "5", sponsorType: "none", vatRate: 22, purchaseDate: "2026-10-01" } },
    });
    const received = await api.post(`/api/inventory-budget/pending/${line.id}/receive`, {
      newItem: { name: "Sensor", category: "Components" }, quantity: "4", receivedOn: "2026-10-05", location: "s1-r2",
    });
    await api.post("/api/inventory/receive", {
      newItem: { name: "Glue", category: "Consumable" }, quantity: "2", unitNet: "10", vatRate: 22, receivedOn: "2026-10-06", location: "s1-r1",
    });
    await api.post("/api/inventory/movements", {
      itemId: received.body.item.id, kind: "use", quantity: "1", occurredOn: "2026-10-10", location: "s1-r2", projectId: project.id,
    });
  }
  const rows = async (query: string) =>
    Object.fromEntries((await api.get(`/api/inventory/stats?${query}`)).body.rows.map((r: { label: string }) => [r.label, r]));

  it("by project: what was received, what is still on its way, what was used", async () => {
    await scene();
    const byProject = await rows("by=project");
    expect(byProject["Brakes"]).toMatchObject({ boughtCents: 2_000, pendingCents: 3_000, usedCents: 500, items: 1 });
    expect(byProject["(no project)"]).toMatchObject({ boughtCents: 2_000, pendingCents: 0 });
    expect((await rows("by=area"))["SW"]).toMatchObject({ boughtCents: 2_000, pendingCents: 3_000, usedCents: 500 });
  });

  it("by category and by location: what is in stock, valued at the average price", async () => {
    await scene();
    const byCategory = await rows("by=category");
    expect(byCategory["Components"]).toMatchObject({ boughtCents: 2_000, pendingCents: 3_000, usedCents: 500, stockCents: 1_500 });
    expect(byCategory["Consumable"]).toMatchObject({ boughtCents: 2_000, stockCents: 2_000 });
    const byLocation = await rows("by=location");
    expect(byLocation["Site 1 - Room 2"]).toMatchObject({ stockCents: 1_500, items: 1 });
    expect(byLocation["Site 1 - Room 1"]).toMatchObject({ stockCents: 2_000 });
  });

  it("at the price asked for", async () => {
    await scene();
    expect((await rows("by=category&basis=gross"))["Components"]).toMatchObject({ boughtCents: 2_440, pendingCents: 3_660 }); // 6.10 per sensor
    expect((await api.get("/api/inventory/stats?by=colour")).status).toBe(400);
  });

  it("is empty when there is nothing, and open to a viewer", async () => {
    expect((await api.get("/api/inventory/stats")).body.rows).toEqual([]);
    expect((await api.as(viewer).get("/api/inventory/stats?by=category")).status).toBe(200);
  });
});
