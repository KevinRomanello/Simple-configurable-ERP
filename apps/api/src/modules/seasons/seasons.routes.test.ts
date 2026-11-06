import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, sponsorId, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const PM = { email: "pm@team.test", role: "pm" as const, areas: ["mt-dmt"] };
const bought = (date: string | null, cost = "100") => ({ quantity: 1, unitNetCost: cost, sponsorType: "none", vatRate: 22, purchaseDate: date });

async function seasons() {
  return (await api.get("/api/seasons")).body;
}
async function seed() {
  return (await seasons()).find((s: { name: string }) => s.name === "2026-2027");
}
/** The headers that choose a season, as the menu of the site sends them. */
const inSeason = (season: { id: number }) => ({ "x-season": String(season.id) });

async function newSeason(startYear: number, car: string) {
  const created = await api.post("/api/seasons", { startYear, car });
  expect(created.status).toBe(201);
  return created.body;
}
async function projectIn(headers: Record<string, string>, name = "Steering") {
  return (await api.post("/api/projects", { areaCode: "mt-dmt", name }, headers)).body;
}

describe("the list of seasons", () => {
  it("has the seeded season, its car, and which one is today's", async () => {
    const list = await seasons();
    expect(list).toEqual([
      expect.objectContaining({ name: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-08-31", car: "Car 2026-2027", readOnly: false, current: true, lines: 0 }),
    ]);
  });

  it("puts the latest first and counts the lines of each budget", async () => {
    await newSeason(2025, "EG-25");
    await newSeason(2030, "EG-30");
    const { id } = await projectIn({});
    await api.post(`/api/projects/${id}/lines`, { item: "Sensor" });
    const list = await seasons();
    expect(list.map((s: any) => [s.name, s.current, s.lines])).toEqual([
      ["2030-2031", false, 0], // not started yet
      ["2026-2027", true, 1],
      ["2025-2026", false, 0], // already over
    ]);
  });
});

describe("a new season", () => {
  it("starts from the latest one: the same projects without lines, the same sponsors without money, its own Team's fund", async () => {
    const { id } = await projectIn({}, "Brakes");
    await api.post(`/api/projects/${id}/lines`, { item: "Disc", figures: { estimate: bought("2026-10-01") } });
    const acme = await sponsorId(api, "Acme", { group: "g" });
    await api.put(`/api/funds/${acme}/contracts/estimate`, { amount: "5000" });

    const next = await newSeason(2027, "EG-28");
    expect(next).toMatchObject({ name: "2027-2028", startsOn: "2027-09-01", endsOn: "2028-08-31", car: "EG-28", readOnly: false });

    const sheet = (await api.get("/api/areas/mt-dmt/sheet", inSeason(next))).body;
    expect(sheet.projects.map((p: any) => [p.name, p.lines.length])).toEqual([["Brakes", 0]]);
    const funds = (await api.get("/api/funds", inSeason(next))).body;
    expect(funds.map((f: any) => [f.name, f.kind, f.group, f.contracts])).toEqual([
      ["Team's fund", "team", null, { estimate: null, actual: null }],
      ["Acme", "external", "g", { estimate: null, actual: null }],
    ]);
    // the season it came from is untouched
    expect((await api.get("/api/areas/mt-dmt/sheet")).body.projects[0].lines).toHaveLength(1);
  });

  it("refuses a season that exists, and anyone but an admin", async () => {
    expect((await api.post("/api/seasons", { startYear: 2026, car: "Again" })).status).toBe(409);
    expect((await api.as(PM).post("/api/seasons", { startYear: 2027, car: "X" })).status).toBe(403);
    expect((await api.post("/api/seasons", { startYear: 2027, car: " " })).status).toBe(400);
    expect((await api.post("/api/seasons", { startYear: 1999, car: "Old" })).status).toBe(400);
  });
});

describe("choosing a season", () => {
  it("changes what every page reads and where every write goes", async () => {
    const old = await newSeason(2025, "EG-25");
    await projectIn(inSeason(old), "Old steering");
    await projectIn({}, "New steering");
    const names = async (headers: Record<string, string>) =>
      (await api.get("/api/areas/mt-dmt/sheet", headers)).body.projects.map((p: any) => p.name);
    expect(await names(inSeason(old))).toEqual(["Old steering"]);
    expect(await names({})).toEqual(["New steering"]);
    expect((await api.get("/api/seasons/current", inSeason(old))).body.name).toBe("2025-2026");
    expect((await api.get("/api/seasons/current")).body.name).toBe("2026-2027");
  });

  it("answers 400 to a header that is not a season id and 404 to a season that does not exist", async () => {
    expect((await api.get("/api/seasons/current", { "x-season": "abc" })).status).toBe(400);
    expect((await api.get("/api/seasons/current", { "x-season": "0" })).status).toBe(400);
    expect((await api.get("/api/areas/mt-dmt/sheet", { "x-season": "99999" })).status).toBe(404);
  });
});

describe("Settings: the car and the lock of a season", () => {
  it("renames the car (admins only) and records it in the history", async () => {
    const season = await seed();
    const renamed = await api.patch(`/api/seasons/${season.id}`, { car: "EG-27" });
    expect(renamed.body).toMatchObject({ car: "EG-27" });
    expect((await api.as(PM).patch(`/api/seasons/${season.id}`, { car: "Mine" })).status).toBe(403);
    expect((await api.patch("/api/seasons/99999", { car: "X" })).status).toBe(404);
    const history = (await api.get("/api/audit?table=season")).body.entries;
    expect(history[0]).toMatchObject({ table: "season", label: "2026-2027", action: "update" });
  });

  it("a read-only season refuses every change to its budget, and opens again", async () => {
    const season = await seed();
    const { id: projectId } = await projectIn({});
    const line = (await api.post(`/api/projects/${projectId}/lines`, { item: "Sensor" })).body;
    const acme = await sponsorId(api, "Acme");
    const inflow = (await api.post("/api/inflows", { phase: "estimate", sourceName: "Gift", amount: "100" })).body;
    await api.patch(`/api/seasons/${season.id}`, { readOnly: true });

    const attempts = [
      await api.post("/api/projects", { areaCode: "mt-dmt", name: "X" }),
      await api.patch(`/api/projects/${projectId}`, { name: "Y" }),
      await api.post(`/api/projects/${projectId}/lines`, { item: "X" }),
      await api.patch(`/api/lines/${line.id}`, { version: line.version, item: "Y" }),
      await api.del(`/api/lines/${line.id}`),
      await api.post("/api/funds", { name: "Other", vatRate: 22 }),
      await api.patch(`/api/funds/${acme}`, { name: "Acme 2" }),
      await api.put(`/api/funds/${acme}/contracts/estimate`, { amount: "10" }),
      await api.post("/api/inflows", { phase: "estimate", sourceName: "X", amount: "1" }),
      await api.del(`/api/inflows/${inflow.id}`),
      await api.put("/api/bank", { amount: "100" }),
      await api.del(`/api/projects/${projectId}`),
    ];
    expect(attempts.map((a) => a.status)).toEqual(attempts.map(() => 409));
    expect(attempts[0]!.body.error).toMatch(/2026-2027 is read-only/);
    // reading is fine, and so is the inventory
    expect((await api.get("/api/areas/mt-dmt/sheet")).status).toBe(200);

    await api.patch(`/api/seasons/${season.id}`, { readOnly: false });
    expect((await api.patch(`/api/lines/${line.id}`, { version: line.version, item: "Y" })).status).toBe(200);
  });
});

describe("the car of a line", () => {
  it("is the car of its season unless another one is chosen", async () => {
    const old = await newSeason(2025, "EG-25");
    const current = await seed();
    const { id } = await projectIn({});
    const created = await api.post(`/api/projects/${id}/lines`, { item: "Spare upright", carSeasonId: old.id });
    expect(created.body.carSeasonId).toBe(old.id);
    const [line] = (await api.get("/api/areas/mt-dmt/sheet")).body.projects[0].lines;
    expect(line.carSeasonId).toBe(old.id);

    // choosing the car of the line's own season is the same as no choice
    const own = await api.patch(`/api/lines/${line.id}`, { version: line.version, carSeasonId: current.id });
    expect(own.body.carSeasonId).toBeNull();
    expect((await api.patch(`/api/lines/${line.id}`, { version: own.body.version, carSeasonId: 99999 })).status).toBe(409);
    expect((await api.post(`/api/projects/${id}/lines`, { item: "X", carSeasonId: 99999 })).status).toBe(409);
  });
});

describe("the TOTAL pages", () => {
  const all = (body: any) => body.blocks[0].total;
  const mtDmt = (body: any) => body.blocks[0].rows.find((r: { areaCode: string }) => r.areaCode === "mt-dmt");

  it("SEASON TOTAL: the season asked for, whatever the menu, with its projects and what came in", async () => {
    const old = await newSeason(2025, "EG-25");
    const oldProject = await projectIn(inSeason(old), "Brakes");
    await api.post(`/api/projects/${oldProject.id}/lines`, { item: "A", figures: { actual: bought("2026-03-01") } }, inSeason(old));
    await api.put("/api/bank", { amount: "5600", asOfDate: "2026-10-15" });
    await api.post("/api/inflows", { phase: "actual", sourceName: "Gala", amount: "2500", inflowDate: "2026-12-12" });

    const today = (await api.get("/api/views/totals", inSeason(old))).body; // no season asked: the one of the menu
    expect(mtDmt(today).projects.map((p: any) => p.name)).toEqual(["Brakes"]);
    const current = (await api.get(`/api/views/totals?season=${(await seed()).id}`, inSeason(old))).body;
    expect(current.moneyIn.rows.map((r: any) => [r.label, r.estimateCents, r.actualCents])).toEqual([["BANK", 560_000, 560_000], ["Gala", 0, 250_000]]);
    expect(all(current).actualOutflowCents).toBe(0);
    const asked = (await api.get(`/api/views/totals?season=${old.id}`)).body;
    expect(mtDmt(asked).projects.map((p: any) => [p.name, p.actualOutflowCents])).toEqual([["Brakes", 12_200]]);
    expect(asked.moneyIn.rows).toEqual([]);
    expect((await api.get("/api/views/totals?season=99999")).status).toBe(404);
  });

  it("YEAR TOTAL: each phase of every season in the year of its date, the projects of the same name together, the money dated in it", async () => {
    const old = await newSeason(2025, "EG-25");
    const oldProject = await projectIn(inSeason(old));
    await api.post(`/api/projects/${oldProject.id}/lines`, { item: "A", figures: { actual: bought("2026-03-01") } }, inSeason(old));
    const { id } = await projectIn({});
    await api.post(`/api/projects/${id}/lines`, { item: "B", figures: { actual: bought("2026-10-01"), estimate: bought("2027-01-10", "50") } });
    await api.post(`/api/projects/${id}/lines`, { item: "C", figures: { actual: bought(null) } });
    await api.post("/api/inflows", { phase: "actual", sourceName: "Gala", amount: "2500", inflowDate: "2026-12-12" });
    await api.post("/api/inflows", { phase: "actual", sourceName: "Later", amount: "100", inflowDate: "2027-01-12" });

    const y2026 = (await api.get("/api/views/totals/year?year=2026")).body;
    expect([all(y2026).estimateOutflowCents, all(y2026).actualOutflowCents]).toEqual([0, 24_400]); // 122.00 from each season
    expect(mtDmt(y2026).projects.map((p: any) => [p.name, p.actualOutflowCents])).toEqual([["Steering", 24_400]]);
    expect(y2026.moneyIn.rows.map((r: any) => [r.label, r.actualCents])).toEqual([["Gala", 250_000]]);
    expect(y2026.undated).toEqual({ estimate: 0, actual: 12_200 });
    expect(all((await api.get("/api/views/totals/year?year=2027")).body).estimateOutflowCents).toBe(6_100);
    expect((await api.get("/api/views/totals/year?year=abc")).status).toBe(400);
  });

  it("CAR TOTAL: the lines bought for a car in any season, and no money", async () => {
    const old = await newSeason(2025, "EG-25");
    const oldProject = await projectIn(inSeason(old));
    await api.post(`/api/projects/${oldProject.id}/lines`, { item: "A", figures: { actual: bought("2026-03-01") } }, inSeason(old));
    const { id } = await projectIn({});
    await api.post(`/api/projects/${id}/lines`, { item: "Spare", carSeasonId: old.id, figures: { actual: bought("2026-10-01", "50") } });
    await api.post(`/api/projects/${id}/lines`, { item: "New", figures: { actual: bought("2026-10-02", "200") } });

    const car = async (name: string) => (await api.get(`/api/views/totals/car?car=${encodeURIComponent(name)}`)).body;
    expect(all(await car("eg-25")).actualOutflowCents).toBe(12_200 + 6_100); // its season, and the spare bought for it later
    expect(all(await car("Car 2026-2027")).actualOutflowCents).toBe(24_400);
    expect(all(await car("Nobody")).actualOutflowCents).toBe(0);
    expect((await car("EG-25")).moneyIn).toBeNull();
  });
});

describe("the inventory of a season", () => {
  const receive = (body: object, headers: Record<string, string> = {}) =>
    api.post(
      "/api/inventory/receive",
      { newItem: { name: `Item ${Math.random()}`, category: "Components", unit: "pcs" }, quantity: "1", location: "s1-r1", unitNet: "10", vatRate: 0, ...body },
      headers,
    );

  it("counts what was bought in the days of the season, and cuts it by car", async () => {
    const old = await newSeason(2025, "EG-25");
    expect((await receive({ receivedOn: "2026-10-01" })).status).toBe(201); // this season, its car
    expect((await receive({ receivedOn: "2026-10-02", carSeasonId: old.id })).status).toBe(201); // this season, the old car
    expect((await receive({ receivedOn: "2026-05-01" })).status).toBe(201); // the old season

    const byCar = (await api.get("/api/inventory/stats?by=car")).body;
    expect(byCar.season).toEqual({ name: "2026-2027", from: "2026-09-01", to: "2027-08-31" });
    expect(byCar.rows.map((r: any) => [r.label, r.boughtCents])).toEqual([["Car 2026-2027", 1_000], ["EG-25", 1_000]]);
    const before = (await api.get("/api/inventory/stats?by=car", inSeason(old))).body;
    expect(before.rows.map((r: any) => [r.label, r.boughtCents])).toEqual([["EG-25", 1_000]]);
  });

  it("refuses a car on an arrival of the budget, and a car that does not exist", async () => {
    expect((await receive({ receivedOn: "2026-10-01", carSeasonId: 99999 })).status).toBe(409);
    const { id } = await projectIn({});
    const line = (await api.post(`/api/projects/${id}/lines`, { item: "S", figures: { actual: bought("2026-10-01") } })).body;
    const old = await newSeason(2025, "EG-25");
    const refused = await api.post("/api/inventory/receive", {
      lineId: line.id, newItem: { name: "S", category: "Components", unit: "pcs" }, quantity: "1", receivedOn: "2026-10-05", location: "s1-r1", carSeasonId: old.id,
    });
    expect(refused.status).toBe(400);
  });
});
