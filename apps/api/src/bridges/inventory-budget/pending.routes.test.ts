import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, testApp } from "../../../test/helpers";

// What the budget bought and the inventory receives (the bridge between the inventory and the budget): PENDING, an arrival for a line of the
// budget, and what it does to the line (ARRIVED, the arrival date). These tests were in modules/inventory/inventory.routes.test.ts until G5.

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

/** A receipt from outside the budget: quantity, net unit price, 22% VAT unless said otherwise. */
const receiveFree = (body: object) =>
  api.post("/api/inventory/receive", {
    quantity: "10", receivedOn: "2026-10-01", location: "s1-r1", unitNet: "1.0000", vatRate: 22, ...body,
  });
const newItem = (name: string, extra: object = {}) => ({ name, category: "Components", unit: "pcs", ...extra });

async function itemWithStock(name = "M3 screw", quantity = "100", extra: object = {}) {
  const { body } = await receiveFree({ newItem: newItem(name), quantity, ...extra });
  return body.item as { id: number; name: string };
}

/** A project and a line of the budget that was bought: `quantity` units at `unit` euros net, 22% VAT. */
async function boughtLine(options: { quantity?: number; unit?: string; item?: string; area?: string; sponsorType?: string } = {}) {
  const project = (await api.post("/api/budget/projects", { areaCode: options.area ?? "sw", name: "Brakes" })).body;
  const line = (await api.post(`/api/budget/projects/${project.id}/lines`, { item: options.item ?? "Pressure sensor", category: "Components" })).body;
  await api.patch(`/api/budget/lines/${line.id}`, {
    version: 1,
    figures: {
      actual: {
        quantity: options.quantity ?? 10, unitNetCost: options.unit ?? "5", sponsorType: options.sponsorType ?? "none",
        vatRate: 22, purchaseDate: "2026-10-01",
      },
    },
  });
  return { project, line };
}
const arrivalOf = async (areaCode: string) => (await api.get(`/api/budget/areas/${areaCode}/sheet`)).body.projects[0].lines[0].arrival;

describe("goods that arrive from a purchase of the budget", () => {
  it("shows what was bought and has not arrived, oldest first, with how long it has waited", async () => {
    const { line } = await boughtLine({ quantity: 10, unit: "5" });
    const [pending] = (await api.get("/api/inventory-budget/pending")).body;
    expect(pending).toMatchObject({
      lineId: line.id, item: "Pressure sensor", status: "ordered", boughtMilli: 10_000, receivedMilli: 0, remainingMilli: 10_000,
      purchaseDate: "2026-10-01", projectName: "Brakes", areaCode: "sw", receivedItemId: null, suggestedItemId: null,
      prices: { net: 50_000, gross: 61_000, team: 61_000 },
    });
    expect(pending.daysWaiting).toBeGreaterThan(0);
    expect(await arrivalOf("sw")).toEqual({ boughtMilli: 10_000, receivedMilli: 0, status: "ordered" });
  });

  it("does not list lines that were only planned", async () => {
    const project = (await api.post("/api/budget/projects", { areaCode: "sw", name: "P" })).body;
    const line = (await api.post(`/api/budget/projects/${project.id}/lines`, { item: "Planned" })).body;
    await api.patch(`/api/budget/lines/${line.id}`, { version: 1, figures: { estimate: { quantity: 3, unitNetCost: "9", sponsorType: "none", vatRate: 22 } } });
    expect((await api.get("/api/inventory-budget/pending")).body).toEqual([]);
    expect(await arrivalOf("sw")).toMatchObject({ status: "planned" });
    const refused = await api.post(`/api/inventory-budget/pending/${line.id}/receive`, { newItem: newItem("Planned"), quantity: "1", receivedOn: "2026-10-05", location: "s1-r1" });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/not been bought/);
  });

  it("takes the prices and the project from the budget, and lets the purchase arrive in parts", async () => {
    const { line, project } = await boughtLine({ quantity: 10, unit: "5" });
    const receiveLine = (body: object) =>
      api.post(`/api/inventory-budget/pending/${line.id}/receive`, { receivedOn: "2026-10-05", location: "s1-r2", spot: "Drawer 3", ...body });

    const first = await receiveLine({ quantity: "4", newItem: newItem("Pressure sensor") });
    expect(first.status).toBe(201);
    expect(first.body.movement).toMatchObject({ budgetLineId: line.id, projectId: project.id, unitNet: "5.0000", unitGross: "6.1000", unitTeam: "6.1000", spot: "Drawer 3" });
    expect(await arrivalOf("sw")).toEqual({ boughtMilli: 10_000, receivedMilli: 4_000, status: "partial" });

    const [pending] = (await api.get("/api/inventory-budget/pending")).body;
    expect(pending).toMatchObject({ status: "partial", remainingMilli: 6_000, receivedItemId: first.body.item.id });

    expect((await receiveLine({ quantity: "7", itemId: first.body.item.id })).status).toBe(409); // only 6 left
    expect((await receiveLine({ quantity: "6", itemId: first.body.item.id })).status).toBe(201);
    expect(await arrivalOf("sw")).toEqual({ boughtMilli: 10_000, receivedMilli: 10_000, status: "received" });
    expect((await api.get("/api/inventory-budget/pending")).body).toEqual([]);

    const again = await receiveLine({ quantity: "1", itemId: first.body.item.id });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already arrived/);
    const detail = (await api.get(`/api/inventory/items/${first.body.item.id}`)).body;
    expect(detail.onHandMilli).toBe(10_000);
    expect(detail.movements).toHaveLength(2);
  });

  it("puts the day of the last arrival in ARRIVAL DATE of ACTUAL, only once all of it has arrived", async () => {
    const { line } = await boughtLine({ quantity: 10, unit: "5" });
    const arrivalDate = async () => (await api.get("/api/budget/areas/sw/sheet")).body.projects[0].lines[0].actual.arrivalDate;
    const receiveLine = (body: object) => api.post(`/api/inventory-budget/pending/${line.id}/receive`, { location: "s1-r1", ...body });
    expect(await arrivalDate()).toBeNull();

    const first = await receiveLine({ quantity: "4", receivedOn: "2026-10-05", newItem: newItem("Pressure sensor") });
    expect(await arrivalDate()).toBeNull(); // only a part
    await receiveLine({ quantity: "6", receivedOn: "2026-10-09", itemId: first.body.item.id });
    expect(await arrivalDate()).toBe("2026-10-09"); // the day written in the form of the last one
  });

  it("suggests the item that has the same name as the line", async () => {
    const item = await itemWithStock("Pressure Sensor", "1");
    await boughtLine({ item: "pressure sensor" });
    expect((await api.get("/api/inventory-budget/pending")).body[0].suggestedItemId).toBe(item.id);
  });

  it("two arrivals of the same purchase at once cannot both take the last pieces", async () => {
    const { line } = await boughtLine({ quantity: 6 });
    const item = await itemWithStock("Sensor", "1");
    const body = { itemId: item.id, quantity: "6", receivedOn: "2026-10-05", location: "s1-r1" };
    const url = `/api/inventory-budget/pending/${line.id}/receive`;
    const answers = await Promise.all([api.post(url, body), api.post(url, body)]);
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(await arrivalOf("sw")).toMatchObject({ receivedMilli: 6_000, status: "received" });
  });

  it("keeps the receipt when the budget line is deleted later", async () => {
    const { line } = await boughtLine({ quantity: 2 });
    const { body } = await api.post(`/api/inventory-budget/pending/${line.id}/receive`, { newItem: newItem("Sensor"), quantity: "2", receivedOn: "2026-10-05", location: "s1-r1" });
    expect((await api.del(`/api/budget/lines/${line.id}`)).status).toBe(204);
    const detail = (await api.get(`/api/inventory/items/${body.item.id}`)).body;
    expect(detail.onHandMilli).toBe(2_000);
    expect(detail.movements[0].budgetLineId).toBeNull();
  });

  it("values a sponsored purchase at what the team pays: the VAT stays with the team", async () => {
    const { line } = await boughtLine({ quantity: 10, unit: "5", sponsorType: "total" });
    const { body } = await api.post(`/api/inventory-budget/pending/${line.id}/receive`, { newItem: newItem("Gift"), quantity: "10", receivedOn: "2026-10-05", location: "s1-r1" });
    expect(body.movement).toMatchObject({ unitNet: "5.0000", unitGross: "6.1000", unitTeam: "1.1000" });
  });
});

describe("the addresses", () => {
  it("are the bridge's (/api/inventory-budget) and the inventory's (/api/inventory): the old ones are gone, with no redirect", async () => {
    for (const old of ["/api/inventory/pending", "/api/inventory/projects", "/api/lookups/units", "/api/lookups/locations", "/api/lookups/category-fields"]) {
      expect((await api.get(old)).status, old).toBe(404);
    }
    for (const now of ["/api/inventory-budget/pending", "/api/inventory-budget/projects", "/api/inventory/units", "/api/inventory/locations", "/api/inventory/category-fields", "/api/inventory/lists"]) {
      expect((await api.get(now)).status, now).toBe(200);
    }
    // a purchase of the budget does not arrive through the inventory's own address any more
    const { line } = await boughtLine({ quantity: 2 });
    const refused = await api.post("/api/inventory/receive", { lineId: line.id, newItem: newItem("Sensor"), quantity: "1", receivedOn: "2026-10-05", location: "s1-r1" });
    expect(refused.status).toBe(400);
    expect(refused.body.issues[0].message).toMatch(/PENDING/);
  });
});
