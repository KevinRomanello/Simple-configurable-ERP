import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, sponsorId, testApp } from "../../../test/helpers";

// The Settings page: the lists and the switches that used to be written in the code.
const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] };
const viewer: Person = { email: "viewer@team.test", role: "viewer" };

const settings = async () => (await api.get("/api/settings")).body;
const categoryId = async (name: string) => (await settings()).categories.find((c: { name: string }) => c.name === name).id as number;

/** A project in the area `sw` with one line of the given category; gives back the line. */
async function lineOf(category: string) {
  const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
  return (await api.post(`/api/projects/${project.id}/lines`, { item: "Part", category })).body;
}

describe("who", () => {
  it("only an admin reads and changes the settings", async () => {
    for (const person of [pm, viewer]) {
      const as = api.as(person);
      const tries = [
        await as.get("/api/settings"),
        await as.post("/api/settings/categories", { name: "Tools" }),
        await as.post("/api/settings/vat-rates", { rate: 5 }),
        await as.patch("/api/settings/calculation", { inflowVatRate: 10 }),
      ];
      expect(tries.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    }
    expect((await api.get("/api/me")).body.permissions.canManageSettings).toBe(true);
    expect((await api.as(pm).get("/api/me")).body.permissions.canManageSettings).toBe(false);
  });

  it("starts from the values of the old sheet", async () => {
    const s = await settings();
    expect(s.categories.map((c: { name: string }) => c.name)).toEqual(["Components", "Manufacturing", "Consumable", "Asset", "Logistic", "Administration", "Software"]);
    expect(s.vatRates.map((r: { rate: number }) => r.rate)).toEqual([0, 11, 22]);
    expect(s.units).toHaveLength(8);
    expect(s.locations).toHaveLength(10);
    expect(s.uncategorizedFields).toEqual(["purpose", "storageNotes"]);
    expect(s.calculation).toEqual({ varianceThreshold: 0.15, vatBaseWhenTotalSponsor: "net", inflowVatRate: 11, bankCompare: { summary: "day", timeline: "month" } });
  });
});

describe("categories", () => {
  it("a new one comes last, with the fields of an item without a category, and names stay unique", async () => {
    expect((await api.post("/api/settings/categories", { name: "Tools" })).status).toBe(201);
    expect((await api.get("/api/lookups/categories")).body.at(-1)).toBe("Tools");
    expect((await api.get("/api/lookups/category-fields")).body.byCategory.Tools).toEqual(["purpose", "storageNotes"]);
    expect((await api.post("/api/settings/categories", { name: "tools" })).status).toBe(409);
    expect((await api.post("/api/settings/categories", { name: "  " })).status).toBe(400);
  });

  it("a renamed category takes its lines and its items with it", async () => {
    const line = await lineOf("Asset");
    const item = (await api.post("/api/inventory/items", { name: "Drill", category: "Asset" })).body;
    expect((await api.patch(`/api/settings/categories/${await categoryId("Asset")}`, { name: "Assets" })).status).toBe(204);
    const sheet = (await api.get("/api/areas/sw/sheet")).body;
    expect(sheet.projects[0].lines.find((l: { id: number }) => l.id === line.id).category).toBe("Assets");
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.item.category).toBe("Assets");
    expect((await api.patch(`/api/settings/categories/${await categoryId("Assets")}`, { name: "software" })).status).toBe(409);
  });

  it("is deleted only when nothing uses it, saying what does", async () => {
    await lineOf("Asset");
    await api.post("/api/inventory/items", { name: "Drill", category: "Asset" });
    const refused = await api.del(`/api/settings/categories/${await categoryId("Asset")}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/1 budget lines and 1 items/);
    expect((await api.del(`/api/settings/categories/${await categoryId("Software")}`)).status).toBe(204);
    expect((await api.get("/api/lookups/categories")).body).not.toContain("Software");
    expect((await api.del("/api/settings/categories/9999")).status).toBe(404);
  });

  it("keeps the order it is given, which TOTAL and the Gantt follow", async () => {
    const ids = (await settings()).categories.map((c: { id: number }) => c.id);
    expect((await api.put("/api/settings/categories/order", { ids: [...ids].reverse() })).status).toBe(204);
    expect((await api.get("/api/lookups/categories")).body[0]).toBe("Software");
    expect((await api.get("/api/views/totals")).body.blocks.map((b: { block: string }) => b.block).slice(0, 2)).toEqual(["ALL", "Software"]);
    expect((await api.put("/api/settings/categories/order", { ids: ids.slice(1) })).status).toBe(400); // one missing
    expect((await api.put("/api/settings/categories/order", { ids: [ids[0], ...ids.slice(0, -1)] })).status).toBe(400); // one twice
  });

  it("says which fields an item shows, also without a category", async () => {
    const id = await categoryId("Software");
    expect((await api.patch(`/api/settings/categories/${id}`, { fields: ["disposal", "purpose"] })).status).toBe(204);
    expect((await api.put("/api/settings/uncategorized-fields", { fields: ["purpose"] })).status).toBe(204);
    const fields = (await api.get("/api/lookups/category-fields")).body;
    expect(fields.byCategory.Software).toEqual(["purpose", "disposal"]); // always in the order of the form
    expect(fields.fallback).toEqual(["purpose"]);
    expect((await api.patch(`/api/settings/categories/${id}`, { fields: ["colour"] })).status).toBe(400);
  });
});

describe("VAT rates", () => {
  it("are added once, with at most two decimals, and offered at once", async () => {
    expect((await api.post("/api/settings/vat-rates", { rate: 5 })).status).toBe(201);
    expect((await api.post("/api/settings/vat-rates", { rate: 5 })).status).toBe(409);
    expect((await api.post("/api/settings/vat-rates", { rate: 4.555 })).status).toBe(400);
    expect((await api.post("/api/settings/vat-rates", { rate: 101 })).status).toBe(400);
    expect((await api.get("/api/lookups/vat-rates")).body).toEqual([0, 5, 11, 22]);
    expect((await api.post("/api/funds", { name: "Five", vatRate: 5 })).status).toBe(201); // a sponsor can use it now
  });

  it("a rate in use cannot be deleted", async () => {
    await sponsorId(api, "Sponsor"); // 22%
    const rates = (await settings()).vatRates as { id: number; rate: number; usedBy: number }[];
    const used = rates.find((r) => r.rate === 22)!;
    expect(used.usedBy).toBe(1);
    expect((await api.del(`/api/settings/vat-rates/${used.id}`)).status).toBe(409);
    expect((await api.del(`/api/settings/vat-rates/${rates.find((r) => r.rate === 0)!.id}`)).status).toBe(204);
  });
});

describe("units", () => {
  it("are added, renamed with the items counted in them, and deleted only when unused", async () => {
    const item = (await api.post("/api/inventory/items", { name: "Cable", unit: "m" })).body;
    const created = await api.post("/api/settings/units", { name: "pair" });
    expect(created.status).toBe(201);
    const metres = (await settings()).units.find((u: { name: string }) => u.name === "m");
    expect((await api.patch(`/api/settings/units/${metres.id}`, { name: "metre" })).status).toBe(204);
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.item.unit).toBe("metre");
    expect((await api.del(`/api/settings/units/${metres.id}`)).status).toBe(409);
    expect((await api.del(`/api/settings/units/${created.body.id}`)).status).toBe(204);
    expect((await api.get("/api/lookups/units")).body).not.toContain("pair");
  });
});

describe("places", () => {
  it("a new place gets a code that never changes, even when it is renamed", async () => {
    const created = await api.post("/api/settings/locations", { site: "Workshop", room: "Back room" });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe("workshop--back-room");
    expect((await api.post("/api/settings/locations", { site: "workshop", room: "back room" })).status).toBe(409);
    expect((await api.patch(`/api/settings/locations/${created.body.id}`, { room: "Store" })).status).toBe(204);
    const place = (await api.get("/api/lookups/locations")).body.find((l: { code: string }) => l.code === "workshop--back-room");
    expect(place).toMatchObject({ site: "Workshop", room: "Store", label: "Workshop / Store" });
  });

  it("a place with movements cannot be deleted; the order is kept", async () => {
    await api.post("/api/inventory/receive", { newItem: { name: "Bolt" }, quantity: "1", receivedOn: "2026-10-01", location: "s1-r1", unitNet: "1", vatRate: 22 });
    const places = (await settings()).locations as { id: number; code: string; usedBy: number }[];
    const used = places.find((p) => p.code === "s1-r1")!;
    expect(used.usedBy).toBe(1);
    expect((await api.del(`/api/settings/locations/${used.id}`)).status).toBe(409);
    expect((await api.del(`/api/settings/locations/${places.find((p) => p.code === "s2-r5")!.id}`)).status).toBe(204);
    const ids = (await settings()).locations.map((p: { id: number }) => p.id);
    expect((await api.put("/api/settings/locations/order", { ids: [...ids].reverse() })).status).toBe(204);
    expect((await api.get("/api/lookups/locations")).body[0].code).toBe("s2-r4");
  });
});

describe("the switches of the calculation", () => {
  it("change every page at once", async () => {
    await api.post("/api/inflows", { phase: "estimate", sourceName: "Sponsor", amount: "1000", inflowDate: "2026-12-10" });
    const vatOf = async () => (await api.get("/api/views/cashflow")).body.estimate.summary.teamOutflowsCents;
    expect(await vatOf()).toBe(11_000);
    expect((await api.patch("/api/settings/calculation", { inflowVatRate: 10 })).status).toBe(204);
    expect(await vatOf()).toBe(10_000);
  });

  it("the VAT of a sponsor that covers the whole line follows the choice", async () => {
    const barter = await sponsorId(api, "Barter", { type: "gift_vat", vatRate: 11 });
    const project = (await api.post("/api/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/projects/${project.id}/lines`, { item: "Ad", figures: { estimate: { quantity: 1, unitNetCost: "1000", fundIds: [barter] } } });
    const vat = async () => (await api.get("/api/areas/sw/sheet")).body.projects[0].lines[0].estimate.amounts.vatCents;
    expect(await vat()).toBe(11_000); // on the whole value, as the treasurer confirmed
    expect((await api.patch("/api/settings/calculation", { vatBaseWhenTotalSponsor: "net-minus-sponsor" })).status).toBe(204);
    expect(await vat()).toBe(0);
  });

  it("refuses values out of range and leaves out what is not sent", async () => {
    const tries = [
      await api.patch("/api/settings/calculation", { varianceThreshold: 1.5 }),
      await api.patch("/api/settings/calculation", { inflowVatRate: -1 }),
      await api.patch("/api/settings/calculation", { vatBaseWhenTotalSponsor: "half" }),
      await api.patch("/api/settings/calculation", { bankCompare: { summary: "week" } }),
    ];
    expect(tries.map((r) => r.status)).toEqual([400, 400, 400, 400]);
    await api.patch("/api/settings/calculation", { varianceThreshold: 0.2, bankCompare: { timeline: "day" } });
    expect((await settings()).calculation).toEqual({ varianceThreshold: 0.2, vatBaseWhenTotalSponsor: "net", inflowVatRate: 11, bankCompare: { summary: "day", timeline: "day" } });
  });
});

describe("history", () => {
  it("records every change with who made it", async () => {
    await api.post("/api/settings/categories", { name: "Tools" });
    await api.patch("/api/settings/calculation", { inflowVatRate: 10 });
    const entries = (await api.get("/api/audit")).body.entries as { table: string; action: string; actor: { email: string } | null; label: string }[];
    expect(entries.some((e) => e.table === "category" && e.action === "insert" && e.label === "Tools" && e.actor?.email)).toBe(true);
    expect(entries.some((e) => e.table === "setting" && e.action === "update" && e.label === "settings")).toBe(true);
  });
});
