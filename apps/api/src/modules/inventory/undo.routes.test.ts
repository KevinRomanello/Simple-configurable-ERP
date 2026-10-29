import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, testApp } from "../../../test/helpers";
import { db } from "../../db/client";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };
const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] };

const makeItem = async (name: string, origin: "bought" | "made" = "bought") =>
  (await api.post("/api/inventory/items", { name, origin })).body as { id: number };
const buy = async (itemId: number, quantity: string, location = "s1-r1", spot = "") =>
  (await api.post("/api/inventory/receive", { itemId, quantity, unitNet: "2", vatRate: 22, receivedOn: "2026-10-01", location, spot })).body.movement.id as number;
const move = async (body: object) => api.post("/api/inventory/movements", { occurredOn: "2026-10-05", location: "s1-r1", spot: "", ...body });
const undo = (id: number) => api.del(`/api/inventory/movements/${id}`);
const detail = async (itemId: number) => (await api.get(`/api/inventory/items/${itemId}`)).body;
/** How many are at a place (0 when nothing is recorded there). */
const at = async (itemId: number, location = "s1-r1") =>
  ((await detail(itemId)).stock as { location: string; quantityMilli: number }[]).filter((s) => s.location === location).reduce((sum, s) => sum + s.quantityMilli, 0) / 1000;
const projectOf = async () => (await api.post("/api/projects", { areaCode: "sw", name: "Pedals" })).body.id as number;
const history = async (id: number) => (await api.get(`/api/audit?table=stock_movement&rowId=${id}`)).body.entries as { action: string }[];

describe("undoing a movement", () => {
  it("takes a use back: the goods are on the shelf again, and the history shows both", async () => {
    const item = await makeItem("Screw");
    await buy(item.id, "10");
    const used = (await move({ itemId: item.id, kind: "use", quantity: "4" })).body.id as number;
    expect(await at(item.id)).toBe(6);

    expect((await undo(used)).status).toBe(204);
    expect(await at(item.id)).toBe(10);
    expect((await detail(item.id)).movements).toHaveLength(1);
    expect((await history(used)).map((e) => e.action).sort()).toEqual(["delete", "insert"]); // recorded, then undone: both are kept
  });

  it("takes a receipt back, unless what it brought has already been used", async () => {
    const item = await makeItem("Screw");
    const receipt = await buy(item.id, "10");
    const used = (await move({ itemId: item.id, kind: "use", quantity: "8" })).body.id as number;

    const refused = await undo(receipt);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/already been used or moved/);
    expect(await at(item.id)).toBe(2); // nothing changed

    await undo(used);
    expect((await undo(receipt)).status).toBe(204);
    expect(await at(item.id)).toBe(0);
    // an item nothing happened to can be deleted again
    expect((await api.del(`/api/inventory/items/${item.id}`)).status).toBe(204);
  });

  it("takes back the arrival of a purchase of the budget: the purchase waits for its goods again", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "Brakes" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, { item: "Pressure sensor", category: "Components" })).body;
    await api.patch(`/api/lines/${line.id}`, {
      version: 1,
      figures: { actual: { quantity: 10, unitNetCost: "5", sponsorType: "none", vatRate: 22, purchaseDate: "2026-10-01" } },
    });
    const arrival = async () => (await api.get("/api/areas/sw/sheet")).body.projects[0].lines[0].arrival;
    const received = await api.post("/api/inventory/receive", {
      lineId: line.id, newItem: { name: "Pressure sensor" }, quantity: "10", receivedOn: "2026-10-03", location: "s1-r1", spot: "",
    });
    expect(await arrival()).toMatchObject({ receivedMilli: 10_000, status: "received" });
    expect((await api.get("/api/inventory/pending")).body).toEqual([]);

    expect((await undo(received.body.movement.id)).status).toBe(204);
    expect(await arrival()).toEqual({ boughtMilli: 10_000, receivedMilli: 0, status: "ordered" });
    expect((await api.get("/api/inventory/pending")).body).toHaveLength(1);
  });

  it("takes back a move, a count and a disposal", async () => {
    const item = await makeItem("Screw");
    await buy(item.id, "10");
    const moved = (await move({ itemId: item.id, kind: "transfer", quantity: "4", toLocation: "s1-r2", toSpot: "" })).body.id as number;
    expect([await at(item.id), await at(item.id, "s1-r2")]).toEqual([6, 4]);
    await undo(moved);
    expect([await at(item.id), await at(item.id, "s1-r2")]).toEqual([10, 0]);

    const counted = (await move({ itemId: item.id, kind: "adjustment", counted: "7" })).body.id as number;
    expect(await at(item.id)).toBe(7);
    await undo(counted);
    expect(await at(item.id)).toBe(10);

    const thrown = (await move({ itemId: item.id, kind: "disposal", quantity: "3" })).body.id as number;
    await undo(thrown);
    expect(await at(item.id)).toBe(10);
  });

  it("does not take back a move whose goods were used at the destination, nor a count that found more", async () => {
    const item = await makeItem("Screw");
    await buy(item.id, "10");
    const moved = (await move({ itemId: item.id, kind: "transfer", quantity: "4", toLocation: "s1-r2", toSpot: "" })).body.id as number;
    await move({ itemId: item.id, kind: "use", quantity: "3", location: "s1-r2" });
    expect((await undo(moved)).status).toBe(409);
    expect([await at(item.id), await at(item.id, "s1-r2")]).toEqual([6, 1]);

    const found = (await move({ itemId: item.id, kind: "adjustment", counted: "9" })).body.id as number; // 6 recorded, 9 counted: +3
    await move({ itemId: item.id, kind: "use", quantity: "9" });
    expect((await undo(found)).status).toBe(409);
  });

  it("is for those who keep the inventory, and says when there is nothing to undo", async () => {
    const item = await makeItem("Screw");
    const receipt = await buy(item.id, "10");
    expect((await api.as(viewer).del(`/api/inventory/movements/${receipt}`)).status).toBe(403);
    expect(await at(item.id)).toBe(10);
    expect((await undo(99_999)).status).toBe(404);
    expect((await api.del("/api/inventory/movements/abc")).status).toBe(400);
    expect((await api.as(pm).del(`/api/inventory/movements/${receipt}`)).status).toBe(204);
  });

  it("gives the same answer to two people who undo the same movement together", async () => {
    const item = await makeItem("Screw");
    const receipt = await buy(item.id, "10");
    await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`select pg_sleep(0.05)`))); // connections already open: only then do the requests overlap
    const both = await Promise.all([undo(receipt), undo(receipt)]);
    expect(both.map((r) => r.status).sort()).toEqual([204, 404]);
  });

  it("does not let an undo and a use take the same goods at the same moment", async () => {
    const item = await makeItem("Screw");
    const receipt = await buy(item.id, "10");
    await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`select pg_sleep(0.05)`)));
    const both = await Promise.all([undo(receipt), move({ itemId: item.id, kind: "use", quantity: "6" })]);
    expect(both.map((r) => r.status).filter((s) => s === 409)).toHaveLength(1); // one wins, the other is told why
    expect(await at(item.id)).toBeGreaterThanOrEqual(0);
  });
});

describe("undoing a build", () => {
  /** pedal = 2 plates + 4 screws, 20 plates and 100 screws on the shelf; 3 pedals made for a project. */
  async function madePedals() {
    const plate = await makeItem("Plate");
    const screw = await makeItem("Screw");
    const pedal = await makeItem("Pedal", "made");
    await buy(plate.id, "20");
    await buy(screw.id, "100");
    await api.post(`/api/inventory/components/${pedal.id}/parts`, { partId: plate.id, quantity: "2" });
    await api.post(`/api/inventory/components/${pedal.id}/parts`, { partId: screw.id, quantity: "4" });
    const projectId = await projectOf();
    const made = await api.post("/api/inventory/builds", { componentId: pedal.id, projectId, quantity: "3", builtOn: "2026-10-10", fromLocation: "s1-r1", toLocation: "s2-r1", toSpot: "" });
    return { plate, screw, pedal, build: made.body.movement.id as number };
  }

  it("takes the pieces off the shelf and gives the parts back, all of them", async () => {
    const { plate, screw, pedal, build } = await madePedals();
    expect([await at(plate.id), await at(screw.id), await at(pedal.id, "s2-r1")]).toEqual([14, 88, 3]);

    expect((await undo(build)).status).toBe(204);
    expect([await at(plate.id), await at(screw.id), await at(pedal.id, "s2-r1")]).toEqual([20, 100, 0]);
    expect((await detail(plate.id)).movements.map((m: { kind: string }) => m.kind)).toEqual(["receipt"]); // the uses went with the build
    expect((await detail(pedal.id)).history).toEqual([]); // and the shelf has no pedal price left
  });

  it("refuses to take back one part of a build: they go back with the build", async () => {
    const { plate } = await madePedals();
    const use = (await detail(plate.id)).movements.find((m: { kind: string }) => m.kind === "use");
    const refused = await undo(use.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/undo the build/);
    expect(await at(plate.id)).toBe(14);
  });

  it("refuses when the pieces have already been used, until that use is undone", async () => {
    const { plate, pedal, build } = await madePedals();
    const used = (await move({ itemId: pedal.id, kind: "use", quantity: "2", location: "s2-r1" })).body.id as number;
    expect((await undo(build)).status).toBe(409);
    expect(await at(plate.id)).toBe(14); // nothing moved

    await undo(used);
    expect((await undo(build)).status).toBe(204);
    expect(await at(plate.id)).toBe(20);
  });

  it("leaves in the history who took the parts and who gave them back", async () => {
    const { plate, build } = await madePedals();
    const partsUse = (await detail(plate.id)).movements.find((m: { kind: string }) => m.kind === "use");
    await undo(build);
    expect((await history(build)).map((e) => e.action).sort()).toEqual(["delete", "insert"]);
    expect((await history(partsUse.id)).map((e) => e.action).sort()).toEqual(["delete", "insert"]);
  });
});
