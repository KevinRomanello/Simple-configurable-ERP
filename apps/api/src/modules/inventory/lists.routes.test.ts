import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, testApp } from "../../../test/helpers";

// The lists the inventory is written with, kept on the Settings page (Settings › Inventory): the fields of a category, the units and the
// places. They were lists of the core until G5 (their tests were in platform/settings/settings.routes.test.ts).
const api = testApp();
// the last test leaves its changes behind: put the lists back for the files that run after this one
afterAll(async () => {
  await resetData();
  await api.close();
});
beforeEach(resetData);

const lists = async () => (await api.get("/api/inventory/lists")).body;
const categoryId = async (name: string) => (await api.get("/api/settings")).body.categories.find((c: { name: string }) => c.name === name).id as number;

describe("the fields of a category", () => {
  it("says which fields an item shows, also without a category", async () => {
    const id = await categoryId("Software");
    expect((await api.put(`/api/inventory/category-fields/${id}`, { fields: ["disposal", "purpose"] })).status).toBe(204);
    expect((await api.put("/api/inventory/uncategorized-fields", { fields: ["purpose"] })).status).toBe(204);
    const fields = (await api.get("/api/inventory/category-fields")).body;
    expect(fields.byCategory.Software).toEqual(["purpose", "disposal"]); // always in the order of the form
    expect(fields.fallback).toEqual(["purpose"]);
    expect((await api.put(`/api/inventory/category-fields/${id}`, { fields: ["colour"] })).status).toBe(400);
    expect((await api.put("/api/inventory/category-fields/9999", { fields: ["purpose"] })).status).toBe(404);
  });

  it("a new category starts with the fields of an item without one, and the Settings page reads them by category", async () => {
    expect((await api.put("/api/inventory/uncategorized-fields", { fields: ["disposal"] })).status).toBe(204);
    const created = (await api.post("/api/settings/categories", { name: "Tools" })).body;
    expect((await api.get("/api/inventory/category-fields")).body.byCategory.Tools).toEqual(["disposal"]);
    expect((await lists()).categoryFields[created.id]).toEqual(["disposal"]);
  });
});

describe("units", () => {
  it("are added, renamed with the items counted in them, and deleted only when unused", async () => {
    const item = (await api.post("/api/inventory/items", { name: "Cable", unit: "m" })).body;
    const created = await api.post("/api/inventory/units", { name: "pair" });
    expect(created.status).toBe(201);
    const metres = (await lists()).units.find((u: { name: string }) => u.name === "m");
    expect((await api.patch(`/api/inventory/units/${metres.id}`, { name: "metre" })).status).toBe(204);
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.item.unit).toBe("metre");
    expect((await api.del(`/api/inventory/units/${metres.id}`)).status).toBe(409);
    expect((await api.del(`/api/inventory/units/${created.body.id}`)).status).toBe(204);
    expect((await api.get("/api/inventory/units")).body).not.toContain("pair");
  });
});

describe("places", () => {
  it("a new place gets a code that never changes, even when it is renamed", async () => {
    const created = await api.post("/api/inventory/locations", { room: "Workshop", shelf: "Back shelf" });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe("workshop--back-shelf");
    expect((await api.post("/api/inventory/locations", { room: "workshop", shelf: "back SHELF" })).status).toBe(409);
    expect((await api.patch(`/api/inventory/locations/${created.body.id}`, { shelf: "Store" })).status).toBe(204);
    const place = (await api.get("/api/inventory/locations")).body.find((l: { code: string }) => l.code === "workshop--back-shelf");
    expect(place).toEqual({ code: "workshop--back-shelf", room: "Workshop", shelf: "Store", level: "", label: "Workshop / Store" });
  });

  it("is a room, and on it a shelf and a level, all plain text; the label has the parts there are", async () => {
    await api.post("/api/inventory/locations", { room: "Lab" });
    await api.post("/api/inventory/locations", { room: "Lab", shelf: "A" });
    await api.post("/api/inventory/locations", { room: "Lab", shelf: "A", levels: ["Top"] });
    const places = (await api.get("/api/inventory/locations")).body as { code: string; label: string }[];
    expect(places.slice(-3).map((p) => [p.code, p.label])).toEqual([["lab", "Lab"], ["lab--a", "Lab / A"], ["lab--a--top", "Lab / A / Top"]]);
    // a room with the same name is another place only if its shelf or level is different
    expect((await api.post("/api/inventory/locations", { room: "LAB" })).status).toBe(409);
  });

  it("makes one place for each level named, all or none, and a level needs a shelf", async () => {
    const count = async () => ((await lists()).locations as unknown[]).length;
    const before = await count();
    const made = await api.post("/api/inventory/locations", { room: "Lab", shelf: "A", levels: ["1", "2", "3", "4"] });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ code: "lab--a--1", created: 4 });
    expect(await count()).toBe(before + 4);
    expect((await api.get("/api/inventory/locations")).body.slice(-4).map((p: { label: string }) => p.label)).toEqual(["Lab / A / 1", "Lab / A / 2", "Lab / A / 3", "Lab / A / 4"]);

    // one that is there already (or named twice) stops the lot: nothing is made
    expect((await api.post("/api/inventory/locations", { room: "Lab", shelf: "A", levels: ["5", "6", "2"] })).status).toBe(409);
    expect((await api.post("/api/inventory/locations", { room: "Lab", shelf: "B", levels: ["1", "1"] })).status).toBe(409);
    expect(await count()).toBe(before + 4);

    // a level is a level of a shelf
    expect((await api.post("/api/inventory/locations", { room: "Lab", levels: ["1"] })).status).toBe(400);
    const room = await api.post("/api/inventory/locations", { room: "Cellar" });
    expect((await api.patch(`/api/inventory/locations/${room.body.id}`, { level: "2" })).status).toBe(400);
    expect((await api.patch(`/api/inventory/locations/${room.body.id}`, { shelf: "C", level: "2" })).status).toBe(204);
    // and a shelf can be taken away only with its level
    expect((await api.patch(`/api/inventory/locations/${room.body.id}`, { shelf: "" })).status).toBe(400);
    expect((await api.post("/api/inventory/locations", { room: "" })).status).toBe(400);
  });

  it("holds the stock: an arrival on a level shows its whole name, and the place cannot be deleted while it is used", async () => {
    const made = await api.post("/api/inventory/locations", { room: "Lab", shelf: "A", levels: ["2"] });
    const received = await api.post("/api/inventory/receive", { newItem: { name: "Washer" }, quantity: "10", receivedOn: "2026-10-01", location: made.body.code, spot: "red box", unitNet: "1", vatRate: 22 });
    expect(received.status).toBe(201);
    const item = (await api.get(`/api/inventory/items/${received.body.itemId ?? received.body.item?.id}`)).body;
    expect(item.stock[0]).toMatchObject({ location: "lab--a--2", label: "Lab / A / 2", spot: "red box" });
    expect((await api.del(`/api/inventory/locations/${made.body.id}`)).status).toBe(409);
  });

  it("a place that things were only moved to is used too", async () => {
    const bolt = (await api.post("/api/inventory/receive", { newItem: { name: "Bolt" }, quantity: "5", receivedOn: "2026-10-01", location: "s1-r1", unitNet: "1", vatRate: 22 })).body;
    const moved = await api.post("/api/inventory/movements", { itemId: bolt.itemId ?? bolt.item?.id, kind: "transfer", quantity: "2", occurredOn: "2026-10-02", location: "s1-r1", spot: "", toLocation: "s2-r1", toSpot: "" });
    expect(moved.status).toBe(201);
    const destination = ((await lists()).locations as { id: number; code: string; usedBy: number }[]).find((p) => p.code === "s2-r1")!;
    expect(destination.usedBy).toBe(1);
    expect((await api.del(`/api/inventory/locations/${destination.id}`)).status).toBe(409);
  });

  it("a place with movements cannot be deleted; the order is kept", async () => {
    await api.post("/api/inventory/receive", { newItem: { name: "Bolt" }, quantity: "1", receivedOn: "2026-10-01", location: "s1-r1", unitNet: "1", vatRate: 22 });
    const places = (await lists()).locations as { id: number; code: string; usedBy: number }[];
    const used = places.find((p) => p.code === "s1-r1")!;
    expect(used.usedBy).toBe(1);
    expect((await api.del(`/api/inventory/locations/${used.id}`)).status).toBe(409);
    expect((await api.del(`/api/inventory/locations/${places.find((p) => p.code === "s2-r5")!.id}`)).status).toBe(204);
    const ids = (await lists()).locations.map((p: { id: number }) => p.id);
    expect((await api.put("/api/inventory/locations/order", { ids: [...ids].reverse() })).status).toBe(204);
    expect((await api.get("/api/inventory/locations")).body[0].code).toBe("s2-r4");
  });
});

