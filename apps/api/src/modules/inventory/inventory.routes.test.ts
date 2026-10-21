import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };
const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] };

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
  const project = (await api.post("/api/projects", { areaCode: options.area ?? "sw", name: "Brakes" })).body;
  const line = (await api.post(`/api/projects/${project.id}/lines`, { item: options.item ?? "Pressure sensor", category: "Components" })).body;
  await api.patch(`/api/lines/${line.id}`, {
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
const arrivalOf = async (areaCode: string) => (await api.get(`/api/areas/${areaCode}/sheet`)).body.projects[0].lines[0].arrival;

describe("the lists the forms are built from", () => {
  it("offers the locations, the units and which fields each category shows", async () => {
    const locations = (await api.get("/api/inventory/../lookups/locations")).body;
    expect(locations[0]).toEqual({ code: "s1-r1", site: "Site 1", room: "Room 1", label: "Site 1 / Room 1" });
    expect(locations).toHaveLength(10);
    expect((await api.get("/api/lookups/units")).body).toContain("pcs");
    const fields = (await api.get("/api/lookups/category-fields")).body;
    expect(fields.byCategory.Consumable).toEqual(expect.arrayContaining(["safetyCodes", "disposal"]));
    expect(fields.byCategory.Components).not.toContain("safetyCodes");
    expect(fields.fallback).toEqual(["purpose", "storageNotes"]);
  });
});

describe("items", () => {
  it("creates an item with what is known; empty optional texts become nothing", async () => {
    const created = await api.post("/api/inventory/items", {
      name: "  Epoxy resin  ", category: "Manufacturing", unit: "kg", purpose: "  Laminating  ",
      safetyCodes: "H315, H319, P280", disposal: "", storageNotes: "   ",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Epoxy resin", unit: "kg", origin: "bought", purpose: "Laminating", safetyCodes: "H315, H319, P280",
      disposal: null, storageNotes: null, code: null,
    });
  });

  it("refuses a second item with the same name (any case) or code, and says which one it clashes with", async () => {
    await api.post("/api/inventory/items", { name: "M3 screw", code: "SCR-3" });
    const sameName = await api.post("/api/inventory/items", { name: "m3 SCREW" });
    expect(sameName.status).toBe(409);
    expect(sameName.body.error).toMatch(/"M3 screw"/);
    expect((await api.post("/api/inventory/items", { name: "Other", code: "scr-3" })).status).toBe(409);
    expect((await api.post("/api/inventory/items", { name: "Other", code: "SCR-4" })).status).toBe(201);
  });

  it("refuses an unknown category or unit, and text it cannot store", async () => {
    expect((await api.post("/api/inventory/items", { name: "X", category: "Nope" })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { name: "X", unit: "bucket" })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { name: "X\u0000" })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { name: "X".repeat(201) })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { name: "X", disposal: "y".repeat(5001) })).status).toBe(400);
  });

  it("edits an item but not what kind of item it is", async () => {
    const { body } = await api.post("/api/inventory/items", { name: "Gloves", category: "Consumable" });
    const edited = await api.patch(`/api/inventory/items/${body.id}`, { name: "Nitrile gloves", disposal: "General waste", code: null });
    expect(edited.body).toMatchObject({ name: "Nitrile gloves", disposal: "General waste", origin: "bought" });
    expect((await api.patch(`/api/inventory/items/${body.id}`, { origin: "made" })).body.origin).toBe("bought");
    expect((await api.patch("/api/inventory/items/9999", { name: "X" })).status).toBe(404);
    await api.post("/api/inventory/items", { name: "Taken" });
    expect((await api.patch(`/api/inventory/items/${body.id}`, { name: "taken" })).status).toBe(409);
  });

  it("deletes an item nothing happened to, and keeps one with movements or in a bill of materials", async () => {
    const free = (await api.post("/api/inventory/items", { name: "Free" })).body;
    expect((await api.del(`/api/inventory/items/${free.id}`)).status).toBe(204);
    expect((await api.del(`/api/inventory/items/${free.id}`)).status).toBe(404);

    const used = await itemWithStock("Used");
    expect((await api.del(`/api/inventory/items/${used.id}`)).status).toBe(409);

    const part = (await api.post("/api/inventory/items", { name: "Part" })).body;
    const made = (await api.post("/api/inventory/items", { name: "Made", origin: "made" })).body;
    await api.post(`/api/inventory/components/${made.id}/parts`, { partId: part.id, quantity: "2" });
    const refused = await api.del(`/api/inventory/items/${part.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/part of 1/);
  });

  it("lists items with stock, price and value, and filters them", async () => {
    await itemWithStock("M3 screw", "100", { unitNet: "0.0850", spot: "Box 2" });
    await receiveFree({ newItem: newItem("Epoxy", { category: "Manufacturing", purpose: "laminating carbon" }), quantity: "2", unitNet: "40", location: "s1-r2" });
    const all = (await api.get("/api/inventory/items")).body;
    expect(all.map((i: { name: string }) => i.name)).toEqual(["Epoxy", "M3 screw"]);
    expect(all[1]).toMatchObject({ onHandMilli: 100_000, boughtMilli: 100_000, unitE4: 850, valueCents: 850, places: ["Site 1 / Room 1"], hasImage: false, complete: true });

    const names = async (query: string) => (await api.get(`/api/inventory/items?${query}`)).body.map((i: { name: string }) => i.name);
    expect(await names("category=Manufacturing")).toEqual(["Epoxy"]);
    expect(await names("search=CARBON")).toEqual(["Epoxy"]); // in the purpose
    expect(await names("location=s1-r2")).toEqual(["Epoxy"]);
    expect(await names("origin=made")).toEqual([]);
    expect((await api.get("/api/inventory/items?basis=cash")).status).toBe(400);
  });
});

describe("goods that arrive from outside the budget", () => {
  it("prices them: VAT added, and nothing for the team when it was a gift", async () => {
    const paid = await receiveFree({ newItem: newItem("Screw"), unitNet: "0.0850" });
    expect(paid.status).toBe(201);
    expect(paid.body.movement).toMatchObject({ kind: "receipt", quantity: "10.000", unitNet: "0.0850", unitGross: "0.1037", unitTeam: "0.1037", budgetLineId: null });

    const gift = await receiveFree({ itemId: paid.body.item.id, unitNet: "2", free: true });
    expect(gift.body.movement).toMatchObject({ unitNet: "2.0000", unitGross: "2.4400", unitTeam: "0.0000" });
    const detail = (await api.get(`/api/inventory/items/${paid.body.item.id}?basis=team&method=average`)).body;
    expect(detail.boughtMilli).toBe(20_000);
    expect(detail.unitE4).toBe(519); // (10 x 0.1037 + 10 x 0) / 20 = 0.05185, rounded to 0.0519
  });

  it("keeps where it was put, down to the spot", async () => {
    const item = await itemWithStock("Screw", "10", { spot: "Shelf 2, red box" });
    const detail = (await api.get(`/api/inventory/items/${item.id}`)).body;
    expect(detail.stock).toEqual([{ itemId: item.id, location: "s1-r1", spot: "Shelf 2, red box", quantityMilli: 10_000, label: "Site 1 / Room 1" }]);
  });

  it("refuses what makes no sense", async () => {
    const item = await itemWithStock();
    const bad = async (patch: object) => (await receiveFree({ itemId: item.id, ...patch })).status;
    expect(await bad({ quantity: "0" })).toBe(400);
    expect(await bad({ quantity: "1000001" })).toBe(400);
    expect(await bad({ location: "nowhere" })).toBe(400);
    expect(await bad({ vatRate: 20 })).toBe(400);
    expect(await bad({ receivedOn: "1999-01-01" })).toBe(400);
    expect(await bad({ itemId: 9999 })).toBe(404);
    expect(await bad({ projectId: 9999 })).toBe(404);
    // both an item and a new one, or neither; a budget line and a price
    expect((await receiveFree({ itemId: item.id, newItem: newItem("Y") })).status).toBe(400);
    expect((await receiveFree({})).status).toBe(400);
    expect((await receiveFree({ itemId: item.id, lineId: 1 })).status).toBe(400);
  });

  it("does not create the item when the receipt is refused", async () => {
    expect((await receiveFree({ newItem: newItem("Ghost"), location: "nowhere" })).status).toBe(400);
    expect((await receiveFree({ newItem: newItem("Ghost"), quantity: "0" })).status).toBe(400);
    expect((await api.get("/api/inventory/items?search=ghost")).body).toEqual([]);
  });
});

describe("goods that arrive from a purchase of the budget", () => {
  it("shows what was bought and has not arrived, oldest first, with how long it has waited", async () => {
    const { line } = await boughtLine({ quantity: 10, unit: "5" });
    const [pending] = (await api.get("/api/inventory/pending")).body;
    expect(pending).toMatchObject({
      lineId: line.id, item: "Pressure sensor", status: "ordered", boughtMilli: 10_000, receivedMilli: 0, remainingMilli: 10_000,
      purchaseDate: "2026-10-01", projectName: "Brakes", areaCode: "sw", receivedItemId: null, suggestedItemId: null,
      prices: { net: 50_000, gross: 61_000, team: 61_000 },
    });
    expect(pending.daysWaiting).toBeGreaterThan(0);
    expect(await arrivalOf("sw")).toEqual({ boughtMilli: 10_000, receivedMilli: 0, status: "ordered" });
  });

  it("does not list lines that were only planned", async () => {
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, { item: "Planned" })).body;
    await api.patch(`/api/lines/${line.id}`, { version: 1, figures: { estimate: { quantity: 3, unitNetCost: "9", sponsorType: "none", vatRate: 22 } } });
    expect((await api.get("/api/inventory/pending")).body).toEqual([]);
    expect(await arrivalOf("sw")).toMatchObject({ status: "planned" });
    const refused = await api.post("/api/inventory/receive", { lineId: line.id, newItem: newItem("Planned"), quantity: "1", receivedOn: "2026-10-05", location: "s1-r1" });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/not been bought/);
  });

  it("takes the prices and the project from the budget, and lets the purchase arrive in parts", async () => {
    const { line, project } = await boughtLine({ quantity: 10, unit: "5" });
    const receiveLine = (body: object) =>
      api.post("/api/inventory/receive", { lineId: line.id, receivedOn: "2026-10-05", location: "s1-r2", spot: "Drawer 3", ...body });

    const first = await receiveLine({ quantity: "4", newItem: newItem("Pressure sensor") });
    expect(first.status).toBe(201);
    expect(first.body.movement).toMatchObject({ budgetLineId: line.id, projectId: project.id, unitNet: "5.0000", unitGross: "6.1000", unitTeam: "6.1000", spot: "Drawer 3" });
    expect(await arrivalOf("sw")).toEqual({ boughtMilli: 10_000, receivedMilli: 4_000, status: "partial" });

    const [pending] = (await api.get("/api/inventory/pending")).body;
    expect(pending).toMatchObject({ status: "partial", remainingMilli: 6_000, receivedItemId: first.body.item.id });

    expect((await receiveLine({ quantity: "7", itemId: first.body.item.id })).status).toBe(409); // only 6 left
    expect((await receiveLine({ quantity: "6", itemId: first.body.item.id })).status).toBe(201);
    expect(await arrivalOf("sw")).toEqual({ boughtMilli: 10_000, receivedMilli: 10_000, status: "received" });
    expect((await api.get("/api/inventory/pending")).body).toEqual([]);

    const again = await receiveLine({ quantity: "1", itemId: first.body.item.id });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already arrived/);
    const detail = (await api.get(`/api/inventory/items/${first.body.item.id}`)).body;
    expect(detail.onHandMilli).toBe(10_000);
    expect(detail.movements).toHaveLength(2);
  });

  it("suggests the item that has the same name as the line", async () => {
    const item = await itemWithStock("Pressure Sensor", "1");
    await boughtLine({ item: "pressure sensor" });
    expect((await api.get("/api/inventory/pending")).body[0].suggestedItemId).toBe(item.id);
  });

  it("two arrivals of the same purchase at once cannot both take the last pieces", async () => {
    const { line } = await boughtLine({ quantity: 6 });
    const item = await itemWithStock("Sensor", "1");
    const body = { lineId: line.id, itemId: item.id, quantity: "6", receivedOn: "2026-10-05", location: "s1-r1" };
    const answers = await Promise.all([api.post("/api/inventory/receive", body), api.post("/api/inventory/receive", body)]);
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(await arrivalOf("sw")).toMatchObject({ receivedMilli: 6_000, status: "received" });
  });

  it("keeps the receipt when the budget line is deleted later", async () => {
    const { line } = await boughtLine({ quantity: 2 });
    const { body } = await api.post("/api/inventory/receive", { lineId: line.id, newItem: newItem("Sensor"), quantity: "2", receivedOn: "2026-10-05", location: "s1-r1" });
    expect((await api.del(`/api/lines/${line.id}`)).status).toBe(204);
    const detail = (await api.get(`/api/inventory/items/${body.item.id}`)).body;
    expect(detail.onHandMilli).toBe(2_000);
    expect(detail.movements[0].budgetLineId).toBeNull();
  });

  it("values a sponsored purchase at what the team pays: the VAT stays with the team", async () => {
    const { line } = await boughtLine({ quantity: 10, unit: "5", sponsorType: "total" });
    const { body } = await api.post("/api/inventory/receive", { lineId: line.id, newItem: newItem("Gift"), quantity: "10", receivedOn: "2026-10-05", location: "s1-r1" });
    expect(body.movement).toMatchObject({ unitNet: "5.0000", unitGross: "6.1000", unitTeam: "1.1000" });
  });
});

describe("what happens on the shelf", () => {
  const move = (body: object) =>
    api.post("/api/inventory/movements", { occurredOn: "2026-10-10", location: "s1-r1", ...body });
  const stockOf = async (id: number) => (await api.get(`/api/inventory/items/${id}`)).body.stock.map((s: { location: string; spot: string; quantityMilli: number }) => [s.location, s.spot, s.quantityMilli / 1000]);

  it("uses goods for a project and refuses to take more than there is at that place", async () => {
    const item = await itemWithStock("Screw", "10");
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "Logger" })).body;
    expect((await move({ itemId: item.id, kind: "use", quantity: "4", projectId: project.id })).status).toBe(201);
    expect(await stockOf(item.id)).toEqual([["s1-r1", "", 6]]);
    const refused = await move({ itemId: item.id, kind: "use", quantity: "7" });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/Only 6.000 pcs/);
    expect((await move({ itemId: item.id, kind: "use", quantity: "1", location: "s1-r2" })).status).toBe(409); // none there
  });

  it("moves goods between places, spots included", async () => {
    const item = await itemWithStock("Screw", "10", { spot: "A" });
    expect((await move({ itemId: item.id, kind: "transfer", quantity: "3", spot: "A", toLocation: "s2-r1", toSpot: "Cupboard" })).status).toBe(201);
    expect(await stockOf(item.id)).toEqual([["s1-r1", "A", 7], ["s2-r1", "Cupboard", 3]]);
    expect((await move({ itemId: item.id, kind: "transfer", quantity: "1", spot: "A", toLocation: "s1-r1", toSpot: "A" })).status).toBe(400);
    expect((await move({ itemId: item.id, kind: "transfer", quantity: "9", spot: "A", toLocation: "s2-r1" })).status).toBe(409);
  });

  it("counts: the difference is recorded, in either direction", async () => {
    const item = await itemWithStock("Screw", "10");
    const down = await move({ itemId: item.id, kind: "adjustment", counted: "7" });
    expect(down.body).toMatchObject({ kind: "adjustment", quantity: "-3.000" });
    const up = await move({ itemId: item.id, kind: "adjustment", counted: "12.5" });
    expect(up.body.quantity).toBe("5.500");
    expect(await stockOf(item.id)).toEqual([["s1-r1", "", 12.5]]);
    expect((await move({ itemId: item.id, kind: "adjustment", counted: "12.5" })).status).toBe(400); // nothing to correct
    expect((await move({ itemId: item.id, kind: "adjustment", counted: "5", location: "s1-r3" })).status).toBe(201); // found somewhere else
    expect((await move({ itemId: item.id, kind: "adjustment", counted: "0", location: "s1-r3" })).status).toBe(201);
    expect(await stockOf(item.id)).toEqual([["s1-r1", "", 12.5]]);
  });

  it("disposes of goods", async () => {
    const item = await itemWithStock("Solvent", "5");
    expect((await move({ itemId: item.id, kind: "disposal", quantity: "5", note: "expired" })).status).toBe(201);
    expect(await stockOf(item.id)).toEqual([]);
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.boughtMilli).toBe(5_000); // what was bought stays bought
  });

  it("asks for exactly what each kind of movement needs", async () => {
    const item = await itemWithStock("Screw", "10");
    expect((await move({ itemId: item.id, kind: "use" })).status).toBe(400);
    expect((await move({ itemId: item.id, kind: "use", quantity: "1", counted: "3" })).status).toBe(400);
    expect((await move({ itemId: item.id, kind: "adjustment" })).status).toBe(400);
    expect((await move({ itemId: item.id, kind: "transfer", quantity: "1" })).status).toBe(400);
    expect((await move({ itemId: item.id, kind: "use", quantity: "1", toLocation: "s1-r2" })).status).toBe(400);
    expect((await move({ itemId: item.id, kind: "receipt", quantity: "1" })).status).toBe(400);
    expect((await move({ itemId: 9999, kind: "use", quantity: "1" })).status).toBe(404);
    expect((await move({ itemId: item.id, kind: "use", quantity: "0" })).status).toBe(400);
    expect((await move({ itemId: item.id, kind: "use", quantity: "1", location: "nowhere" })).status).toBe(400);
  });

  it("never lets simultaneous requests take more than there is", async () => {
    const item = await itemWithStock("Screw", "5");
    const answers = await Promise.all(Array.from({ length: 12 }, () => move({ itemId: item.id, kind: "use", quantity: "1" })));
    expect(answers.filter((a) => a.status === 201)).toHaveLength(5);
    expect(answers.filter((a) => a.status === 409)).toHaveLength(7);
    expect(await stockOf(item.id)).toEqual([]);
  });
});

describe("prices over time", () => {
  it("tells the price of an item on any day, by the latest purchase or by the average, in the three kinds", async () => {
    const item = await itemWithStock("M3 screw", "100", { receivedOn: "2026-09-01", unitNet: "0.0850" });
    await receiveFree({ itemId: item.id, quantity: "50", receivedOn: "2026-10-01", unitNet: "0.1000" });
    const price = async (query: string) => (await api.get(`/api/inventory/items/${item.id}?${query}`)).body.unitE4;

    expect(await price("on=2026-12-31")).toBe(1_000); // net, latest
    expect(await price("on=2026-09-15")).toBe(850);
    expect(await price("on=2026-08-31")).toBeNull();
    expect(await price("method=average&on=2026-12-31")).toBe(900); // (100 x 0.085 + 50 x 0.10) / 150
    expect(await price("basis=gross&on=2026-12-31")).toBe(1_220);
    expect(await price("basis=gross&method=average&on=2026-12-31")).toBe(1_098); // net 0.09 + VAT, rounded the same way as each receipt

    const { history } = (await api.get(`/api/inventory/items/${item.id}`)).body;
    expect(history).toEqual([{ on: "2026-09-01", quantityMilli: 100_000, unitE4: 850 }, { on: "2026-10-01", quantityMilli: 50_000, unitE4: 1_000 }]);
  });
});

describe("pictures", () => {
  // a real 1 x 1 pixel PNG
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");
  const put = (id: number, body: object) => api.put(`/api/inventory/items/${id}/image`, body);

  it("stores a picture, shows it in the lists and serves it for the browser to keep and re-check", async () => {
    const item = await itemWithStock();
    expect((await put(item.id, { mime: "image/png", full: png, thumb: png })).status).toBe(204);
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.hasImage).toBe(true);
    expect((await api.get("/api/inventory/items")).body[0].hasImage).toBe(true);

    const first = await api.app.inject({ method: "GET", url: `/api/inventory/items/${item.id}/image?size=thumb`, headers: { cookie: (await cookieOf()) } });
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    expect(first.headers["cache-control"]).toBe("private, max-age=0, must-revalidate");
    expect(first.headers["x-content-type-options"]).toBe("nosniff");
    expect(first.rawPayload.subarray(1, 4).toString()).toBe("PNG");

    const same = await api.app.inject({ method: "GET", url: `/api/inventory/items/${item.id}/image?size=thumb`, headers: { cookie: await cookieOf(), "if-none-match": String(first.headers.etag) } });
    expect(same.statusCode).toBe(304);
  });

  it("refuses what is not really a picture, or is too big", async () => {
    const item = await itemWithStock();
    expect((await put(item.id, { mime: "image/jpeg", full: png, thumb: png })).status).toBe(400); // a PNG that says it is a JPEG
    expect((await put(item.id, { mime: "image/png", full: jpegHeader, thumb: png })).status).toBe(400);
    expect((await put(item.id, { mime: "image/gif", full: png, thumb: png })).status).toBe(400);
    expect((await put(item.id, { mime: "image/png", full: "not base64!!", thumb: png })).status).toBe(400);
    expect((await put(item.id, { mime: "image/png", full: Buffer.from("<svg onload=alert(1)>").toString("base64"), thumb: png })).status).toBe(400);
    const big = Buffer.concat([Buffer.from(png, "base64"), Buffer.alloc(650_000)]).toString("base64");
    expect((await put(item.id, { mime: "image/png", full: big, thumb: png })).status).toBe(400);
    expect((await put(9999, { mime: "image/png", full: png, thumb: png })).status).toBe(404);
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.hasImage).toBe(false);
  });

  it("replaces and removes a picture", async () => {
    const item = await itemWithStock();
    await put(item.id, { mime: "image/png", full: png, thumb: png });
    await put(item.id, { mime: "image/png", full: png, thumb: png });
    expect((await api.del(`/api/inventory/items/${item.id}/image`)).status).toBe(204);
    expect((await api.get(`/api/inventory/items/${item.id}/image`)).status).toBe(404);
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.hasImage).toBe(false);
  });

  it("keeps the picture out of the history, and shows that it changed", async () => {
    const item = await itemWithStock();
    await put(item.id, { mime: "image/png", full: png, thumb: png });
    const entries = (await api.get("/api/audit?limit=50")).body.entries;
    expect(entries.some((e: { table: string }) => e.table === "item_image")).toBe(false);
    const change = entries.find((e: { table: string; action: string }) => e.table === "inventory_item" && e.action === "update");
    expect(change.changes.map((c: { field: string }) => c.field)).toContain("image_updated_at");
  });
});

describe("who may do what", () => {
  it("lets everybody look and only admins and project managers change", async () => {
    const item = await itemWithStock();
    const as = api.as(viewer);
    for (const url of ["/api/inventory/items", `/api/inventory/items/${item.id}`, "/api/inventory/pending", "/api/inventory/components", "/api/inventory/stats", "/api/lookups/locations"]) {
      expect([url, (await as.get(url)).status]).toEqual([url, 200]);
    }
    const attempts = [
      await as.post("/api/inventory/items", { name: "X" }),
      await as.patch(`/api/inventory/items/${item.id}`, { name: "Y" }),
      await as.del(`/api/inventory/items/${item.id}`),
      await as.post("/api/inventory/receive", { newItem: newItem("Z"), quantity: "1", receivedOn: "2026-10-01", location: "s1-r1", unitNet: "1", vatRate: 22 }),
      await as.post("/api/inventory/movements", { itemId: item.id, kind: "use", quantity: "1", occurredOn: "2026-10-01", location: "s1-r1" }),
      await as.put(`/api/inventory/items/${item.id}/image`, { mime: "image/png", full: "AA==", thumb: "AA==" }),
      await as.post("/api/inventory/components/1/parts", { partId: 2, quantity: "1" }),
    ];
    expect(attempts.map((a) => a.status)).toEqual(attempts.map(() => 403));

    // a project manager keeps the inventory, whatever area they are assigned to
    expect((await api.as(pm).post("/api/inventory/items", { name: "From a pm" })).status).toBe(201);
  });

  it("records everything in the history", async () => {
    const item = await itemWithStock("Screw");
    await api.post("/api/inventory/movements", { itemId: item.id, kind: "use", quantity: "1", occurredOn: "2026-10-10", location: "s1-r1" });
    const entries = (await api.get("/api/audit?limit=50")).body.entries;
    const labels = entries.map((e: { table: string; label: string }) => `${e.table}: ${e.label}`);
    expect(labels).toEqual(expect.arrayContaining([`inventory_item: Screw`, `stock_movement: receipt of item ${item.id}`, `stock_movement: use of item ${item.id}`]));
    expect(entries.every((e: { actor: { email: string } | null }) => e.actor?.email === "admin@team.test")).toBe(true);
  });
});

/** The cookie of the default admin, to call the image route without the JSON helper. */
async function cookieOf() {
  const { cookieFor, createUser, ADMIN } = await import("../../../test/helpers");
  return cookieFor((await createUser(ADMIN)).id);
}
