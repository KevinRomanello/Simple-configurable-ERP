import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, sponsorId, testApp } from "../../../test/helpers";

// The Settings page: the lists and the switches that used to be written in the code. The lists of the inventory (units, places,
// the fields of a category) are the inventory's: modules/inventory/lists.routes.test.ts.
const api = testApp();
// the last test leaves its changes behind: put the lists and switches back for the files that run after this one
afterAll(async () => {
  await resetData();
  await api.close();
});
beforeEach(resetData);

const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] };
const viewer: Person = { email: "viewer@team.test", role: "viewer" };

const settings = async () => (await api.get("/api/settings")).body;
const categoryId = async (name: string) => (await settings()).categories.find((c: { name: string }) => c.name === name).id as number;

/** A project in the area `sw` with one line of the given category; gives back the line. */
async function lineOf(category: string) {
  const project = (await api.post("/api/budget/projects", { areaCode: "sw", name: "P" })).body;
  return (await api.post(`/api/budget/projects/${project.id}/lines`, { item: "Part", category })).body;
}

describe("who", () => {
  it("an admin changes everything; a user keeps the lists of the inventory but not the calculation, the VAT rates or the seasons; a viewer nothing", async () => {
    const user = api.as(pm);
    expect((await user.get("/api/settings")).status).toBe(200);
    const category = await user.post("/api/settings/categories", { name: "Tools" });
    const unit = await user.post("/api/inventory/units", { name: "drum" });
    const place = await user.post("/api/inventory/locations", { room: "Lab", shelf: "Shelf" });
    expect([category.status, unit.status, place.status]).toEqual([201, 201, 201]);
    expect((await user.patch(`/api/settings/categories/${category.body.id}`, { name: "Tools 2" })).status).toBe(204);
    expect((await user.put("/api/inventory/uncategorized-fields", { fields: ["purpose"] })).status).toBe(204);
    expect((await user.patch(`/api/inventory/units/${unit.body.id}`, { name: "drum 2" })).status).toBe(204);
    expect((await user.patch(`/api/inventory/locations/${place.body.id}`, { shelf: "Shelf 2" })).status).toBe(204);
    expect((await user.del(`/api/inventory/locations/${place.body.id}`)).status).toBe(204);
    expect((await user.del(`/api/inventory/units/${unit.body.id}`)).status).toBe(204);
    expect((await user.del(`/api/settings/categories/${category.body.id}`)).status).toBe(204);

    // the switches of the calculation, the VAT rates and the seasons stay with the admin
    const notTheirs = [
      await user.post("/api/settings/vat-rates", { rate: 5 }),
      await user.patch("/api/budget/settings/calculation", { inflowVatRate: 10 }),
      await user.post("/api/seasons", { startYear: 2030, car: "Car" }),
    ];
    expect(notTheirs.map((r) => r.status)).toEqual([403, 403, 403]);

    const viewing = api.as(viewer);
    const tries = [
      await viewing.get("/api/settings"),
      await viewing.get("/api/inventory/lists"),
      await viewing.post("/api/settings/categories", { name: "Tools" }),
      await viewing.post("/api/inventory/units", { name: "drum" }),
      await viewing.post("/api/inventory/locations", { room: "Lab", shelf: "Shelf" }),
      await viewing.post("/api/settings/vat-rates", { rate: 5 }),
      await viewing.patch("/api/budget/settings/calculation", { inflowVatRate: 10 }),
    ];
    expect(tries.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect((await api.get("/api/me")).body.permissions.canManageSettings).toBe(true);
    expect((await user.get("/api/me")).body.permissions.canManageSettings).toBe(false);
  });

  it("starts from the values of the old sheet", async () => {
    const s = await settings();
    expect(s.categories.map((c: { name: string }) => c.name)).toEqual(["Components", "Manufacturing", "Consumable", "Asset", "Logistic", "Administration", "Software"]);
    expect(s.vatRates.map((r: { rate: number }) => r.rate)).toEqual([0, 11, 22]);
    const lists = (await api.get("/api/inventory/lists")).body;
    expect(lists.units).toHaveLength(8);
    expect(lists.locations).toHaveLength(10);
    expect(lists.uncategorizedFields).toEqual(["purpose", "storageNotes"]);
    // the switches of the calculation are the budget's (GET /api/lookups/settings)
    expect((await api.get("/api/budget/lookups/settings")).body).toMatchObject({ varianceThreshold: 0.15, vatBaseWhenTotalSponsor: "net", inflowVatRate: 11, bankCompare: { summary: "day", timeline: "month" } });
  });
});

describe("categories", () => {
  it("a new one comes last, with the fields of an item without a category, and names stay unique", async () => {
    expect((await api.post("/api/settings/categories", { name: "Tools" })).status).toBe(201);
    expect((await api.get("/api/lookups/categories")).body.at(-1)).toBe("Tools");
    expect((await api.get("/api/inventory/category-fields")).body.byCategory.Tools).toEqual(["purpose", "storageNotes"]);
    expect((await api.post("/api/settings/categories", { name: "tools" })).status).toBe(409);
    expect((await api.post("/api/settings/categories", { name: "  " })).status).toBe(400);
  });

  it("a renamed category takes its lines and its items with it", async () => {
    const line = await lineOf("Asset");
    const item = (await api.post("/api/inventory/items", { name: "Drill", category: "Asset" })).body;
    expect((await api.patch(`/api/settings/categories/${await categoryId("Asset")}`, { name: "Assets" })).status).toBe(204);
    const sheet = (await api.get("/api/budget/areas/sw/sheet")).body;
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

  it("is used also by the types of items, which are the inventory's: the answer comes from there", async () => {
    const software = await categoryId("Software");
    expect((await api.post("/api/inventory/types", { name: "Firmware", categoryId: software })).status).toBe(201);
    expect(((await settings()).categories as { id: number; usedBy: number }[]).find((c) => c.id === software)!.usedBy).toBe(1);
    const refused = await api.del(`/api/settings/categories/${software}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/1 item types/);
  });

  it("is still in use while the module that uses it is off: it cannot be deleted while that module sleeps", async () => {
    await lineOf("Asset");
    await api.post("/api/inventory/items", { name: "Drill", category: "Software" });
    expect((await api.patch("/api/modules/budget", { enabled: false })).status).toBe(204);
    expect((await api.patch("/api/modules/inventory", { enabled: false })).status).toBe(204);
    const asset = await api.del(`/api/settings/categories/${await categoryId("Asset")}`);
    expect(asset.status).toBe(409);
    expect(asset.body.error).toMatch(/1 budget lines/);
    const software = await api.del(`/api/settings/categories/${await categoryId("Software")}`);
    expect(software.status).toBe(409);
    expect(software.body.error).toMatch(/1 items/);
  });

  it("keeps the order it is given, which TOTAL and the Gantt follow", async () => {
    const ids = (await settings()).categories.map((c: { id: number }) => c.id);
    expect((await api.put("/api/settings/categories/order", { ids: [...ids].reverse() })).status).toBe(204);
    expect((await api.get("/api/lookups/categories")).body[0]).toBe("Software");
    expect((await api.get("/api/budget/views/totals")).body.blocks.map((b: { block: string }) => b.block).slice(0, 2)).toEqual(["ALL", "Software"]);
    expect((await api.put("/api/settings/categories/order", { ids: ids.slice(1) })).status).toBe(400); // one missing
    expect((await api.put("/api/settings/categories/order", { ids: [ids[0], ...ids.slice(0, -1)] })).status).toBe(400); // one twice
  });
});

describe("VAT rates", () => {
  it("are added once, with at most two decimals, and offered at once", async () => {
    expect((await api.post("/api/settings/vat-rates", { rate: 5 })).status).toBe(201);
    expect((await api.post("/api/settings/vat-rates", { rate: 5 })).status).toBe(409);
    expect((await api.post("/api/settings/vat-rates", { rate: 4.555 })).status).toBe(400);
    expect((await api.post("/api/settings/vat-rates", { rate: 101 })).status).toBe(400);
    expect((await api.get("/api/lookups/vat-rates")).body).toEqual([0, 5, 11, 22]);
    expect((await api.post("/api/budget/funds", { name: "Five", vatRate: 5 })).status).toBe(201); // a sponsor can use it now
  });

  it("a rate in use cannot be deleted", async () => {
    await sponsorId(api, "Sponsor"); // 22%
    const rates = (await settings()).vatRates as { id: number; rate: number; usedBy: number }[];
    const used = rates.find((r) => r.rate === 22)!;
    expect(used.usedBy).toBe(1);
    expect((await api.del(`/api/settings/vat-rates/${used.id}`)).status).toBe(409);
    expect((await api.del(`/api/settings/vat-rates/${rates.find((r) => r.rate === 0)!.id}`)).status).toBe(204);
  });

  it("a rate a sponsor uses stays in use while the budget is off", async () => {
    await sponsorId(api, "Sponsor"); // 22%
    expect((await api.patch("/api/modules/budget", { enabled: false })).status).toBe(204);
    const rates = (await settings()).vatRates as { id: number; rate: number; usedBy: number }[];
    const used = rates.find((r) => r.rate === 22)!;
    expect(used.usedBy).toBe(1);
    const refused = await api.del(`/api/settings/vat-rates/${used.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/1 sponsors/);
  });
});

describe("the switches of the calculation", () => {
  it("change every page at once", async () => {
    await api.post("/api/budget/inflows", { phase: "estimate", sourceName: "Sponsor", amount: "1000", inflowDate: "2026-12-10" });
    const vatOf = async () => (await api.get("/api/budget/views/cashflow")).body.estimate.summary.teamOutflowsCents;
    expect(await vatOf()).toBe(11_000);
    expect((await api.patch("/api/budget/settings/calculation", { inflowVatRate: 10 })).status).toBe(204);
    expect(await vatOf()).toBe(10_000);
  });

  it("the VAT of a sponsor that covers the whole line follows the choice", async () => {
    const barter = await sponsorId(api, "Barter", { type: "gift_vat", vatRate: 11 });
    const project = (await api.post("/api/budget/projects", { areaCode: "sw", name: "P" })).body;
    await api.post(`/api/budget/projects/${project.id}/lines`, { item: "Ad", figures: { estimate: { quantity: 1, unitNetCost: "1000", fundIds: [barter] } } });
    const vat = async () => (await api.get("/api/budget/areas/sw/sheet")).body.projects[0].lines[0].estimate.amounts.vatCents;
    expect(await vat()).toBe(11_000); // on the whole value, as the treasurer confirmed
    expect((await api.patch("/api/budget/settings/calculation", { vatBaseWhenTotalSponsor: "net-minus-sponsor" })).status).toBe(204);
    expect(await vat()).toBe(0);
  });

  it("refuses values out of range and leaves out what is not sent", async () => {
    const tries = [
      await api.patch("/api/budget/settings/calculation", { varianceThreshold: 1.5 }),
      await api.patch("/api/budget/settings/calculation", { inflowVatRate: -1 }),
      await api.patch("/api/budget/settings/calculation", { vatBaseWhenTotalSponsor: "half" }),
      await api.patch("/api/budget/settings/calculation", { bankCompare: { summary: "week" } }),
    ];
    expect(tries.map((r) => r.status)).toEqual([400, 400, 400, 400]);
    await api.patch("/api/budget/settings/calculation", { varianceThreshold: 0.2, bankCompare: { timeline: "day" } });
    expect((await api.get("/api/budget/lookups/settings")).body).toMatchObject({ varianceThreshold: 0.2, vatBaseWhenTotalSponsor: "net", inflowVatRate: 11, bankCompare: { summary: "day", timeline: "day" } });
  });
});

describe("editing from a phone", () => {
  const asked = async (person?: Person) => (await (person ? api.as(person) : api).get("/api/me")).body.editOnPhone;

  it("is allowed until an admin says it is not, and everybody is told, whoever they are", async () => {
    expect(await asked()).toBe(true);
    expect((await api.patch("/api/settings/site", { editOnPhone: false })).status).toBe(204);
    expect(await asked()).toBe(false);
    expect(await asked(pm)).toBe(false);
    expect(await asked(viewer)).toBe(false); // a viewer cannot read /api/settings: the answer comes with who they are
    expect((await api.patch("/api/settings/site", { editOnPhone: true })).status).toBe(204);
    expect(await asked(viewer)).toBe(true);
  });

  it("is the admin's alone: a user, a viewer and the treasury get 403 and nothing changes", async () => {
    for (const person of [pm, viewer, { email: "treasury@team.test", role: "pm" as const, treasury: true }]) {
      expect((await api.as(person).patch("/api/settings/site", { editOnPhone: false })).status).toBe(403);
    }
    expect(await asked()).toBe(true);
  });

  it("refuses what is not a yes or a no, and is in the history like the other switches", async () => {
    expect((await api.patch("/api/settings/site", { editOnPhone: "no" })).status).toBe(400);
    expect((await api.patch("/api/settings/site", {})).status).toBe(400);
    await api.patch("/api/settings/site", { editOnPhone: false });
    const entries = (await api.get("/api/audit")).body.entries as { table: string; action: string; label: string }[];
    expect(entries.some((e) => e.table === "setting" && e.action === "update" && e.label === "settings")).toBe(true);
  });
});

describe("history", () => {
  it("records every change with who made it", async () => {
    await api.post("/api/settings/categories", { name: "Tools" });
    await api.patch("/api/budget/settings/calculation", { inflowVatRate: 10 });
    const entries = (await api.get("/api/audit")).body.entries as { table: string; action: string; actor: { email: string } | null; label: string }[];
    expect(entries.some((e) => e.table === "category" && e.action === "insert" && e.label === "Tools" && e.actor?.email)).toBe(true);
    expect(entries.some((e) => e.table === "setting" && e.action === "update" && e.label === "settings")).toBe(true);
  });
});
