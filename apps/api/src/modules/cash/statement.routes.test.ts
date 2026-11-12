import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const TREASURER = { email: "treasury@team.test", role: "pm" as const, treasury: true };
const PM = { email: "pm@team.test", role: "pm" as const, areas: ["mt-dmt"] };
const VIEWER = { email: "viewer@team.test", role: "viewer" as const };

interface Row { row: number; kind: string; label: string; cents: number | null; partialCents: number | null; count: number }
interface Issue { kind: string; row: number | null; label: string; count: number; cents: number }

/** A movement of the register: `cents` positive for money in, negative for money out. */
async function move(voce: string | null, cents: number, over: { account?: string; on?: string } = {}) {
  const category = voce === null ? undefined : (await api.get("/api/cash/categories")).body.find((c: { name: string }) => c.name === voce);
  if (voce !== null) expect(category, `the Voce ${voce}`).toBeDefined();
  const created = await api.post("/api/cash/entries", {
    on: over.on ?? "2026-03-10", description: "Test", account: over.account ?? "bank", direction: cents < 0 ? "out" : "in",
    amount: (Math.abs(cents) / 100).toFixed(2), categoryId: category?.id,
  });
  expect(created.status).toBe(201);
}
const statement = async (year = 2026) => (await api.get(`/api/cash/statement?year=${year}`)).body as { year: number; years: number[]; rows: Row[]; issues: Issue[] };
const rowOf = (rows: Row[], row: number) => rows.find((r) => r.row === row)!;

describe("who can see the financial statement", () => {
  it("the admins and the treasury can; a project manager without the box and a viewer cannot", async () => {
    expect((await api.get("/api/cash/statement")).status).toBe(200);
    expect((await api.as(TREASURER).get("/api/cash/statement")).status).toBe(200);
    expect((await api.as(PM).get("/api/cash/statement")).status).toBe(403);
    expect((await api.as(VIEWER).get("/api/cash/statement")).status).toBe(403);
  });
});

describe("the financial statement of a year", () => {
  it("is the table of the sheet: its 70 rows (the two blank ones too) in the same order, and the result at the bottom", async () => {
    const { rows, year } = await statement();
    expect(rows).toHaveLength(70);
    expect(rows.map((r) => r.row)).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
    expect(rowOf(rows, 1)).toMatchObject({ kind: "title", label: "RICAVI" });
    expect(rowOf(rows, 27).label).toBe("TOTALE RICAVI");
    expect(rowOf(rows, 70)).toMatchObject({ label: "AVANZO O DISAVANZO DI GESTIONE", cents: null, partialCents: 0 });
    expect(year).toBeGreaterThanOrEqual(2026);
  });

  it("adds each movement to the row of its Voce and the rows above it, and only those of the year", async () => {
    await move("2.1 da soci e tesserati", 5_000);
    await move("6.1 Da pubblicità e sponsorizzazioni", 20_000, { account: "cash" });
    await move("1.1 Attrezzature", -7_500);
    await move("8.2 Imposta di bollo", -1_600);
    await move("2.1 da soci e tesserati", 9_999, { on: "2025-12-31" });
    const { rows } = await statement(2026);
    expect(rowOf(rows, 4)).toMatchObject({ cents: 5_000, count: 1 });
    expect(rowOf(rows, 17)).toMatchObject({ cents: 5_000 });
    expect(rowOf(rows, 22)).toMatchObject({ cents: 20_000 });
    expect(rowOf(rows, 27)).toMatchObject({ cents: 25_000, partialCents: 25_000 });
    expect(rowOf(rows, 30)).toMatchObject({ cents: -7_500, partialCents: 7_500 });
    expect(rowOf(rows, 60)).toMatchObject({ cents: -1_600 });
    expect(rowOf(rows, 68)).toMatchObject({ cents: -9_100, partialCents: 9_100 });
    expect(rowOf(rows, 70).partialCents).toBe(15_900);
    expect(rowOf((await statement(2025)).rows, 4).cents).toBe(9_999);
  });

  it("finds a Voce by its name whatever the capitals: the list says Europea, the sheet europea", async () => {
    await move("4.2 da Comunità Europea e da altri organismi internazionali", 1_200);
    expect(rowOf((await statement()).rows, 12).cents).toBe(1_200);
  });

  it("lists the years of the register, the current one included, newest first", async () => {
    await move("1.4 Altro", -100, { on: "2024-05-05" });
    const { years } = await statement();
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years).toContain(2024);
  });
});

describe("the defects of the sheet, copied on purpose", () => {
  it("leaves the Paypal movements out of QUOTE ASSOCIATIVE, 1.2 and 1.3, and counts them everywhere else", async () => {
    await move("1. QUOTE ASSOCIATIVE", 4_000, { account: "paypal" });
    await move("1.2 Cancelleria e materiali da ufficio", -300, { account: "paypal" });
    await move("1.4 Altro", -500, { account: "paypal" });
    const { rows, issues } = await statement();
    expect(rowOf(rows, 2).cents).toBe(0);
    expect(rowOf(rows, 32).cents).toBe(0);
    expect(rowOf(rows, 34).cents).toBe(-500);
    expect(issues.filter((i) => i.kind === "paypalLeftOut").map((i) => [i.row, i.count, i.cents])).toEqual([[2, 1, 4_000], [32, 1, -300], [33, 0, 0]]);
  });

  it("does not add 4.4 da università to the contributions of public bodies, nor to any total", async () => {
    await move("4.1 da comune, provincia, regione, stato", 1_000);
    await move("4.4 da università", 700);
    const { rows, issues } = await statement();
    expect(rowOf(rows, 14).cents).toBe(700);
    expect(rowOf(rows, 10).cents).toBe(1_000);
    expect(rowOf(rows, 27).cents).toBe(1_000);
    expect(issues).toContainEqual({ kind: "outsideTotals", row: 14, label: "4.4 da università", count: 1, cents: 700 });
    expect(issues.filter((i) => i.kind === "outsideTotals").map((i) => i.row)).toEqual([14, 16]);
  });

  it("counts the VAT inside IMPOSTE E TASSE and once in the total of the costs", async () => {
    await move("8.1 IRES/IRAP", -100);
    await move("9.3 Liquidazione IVA", -2_200);
    const { rows, issues } = await statement();
    expect(rowOf(rows, 64).cents).toBe(-2_200);
    expect(rowOf(rows, 60).cents).toBe(-2_300);
    expect(rowOf(rows, 68).cents).toBe(-2_300);
    expect(issues).toContainEqual({ kind: "sectionInSection", row: 64, label: "9. IVA", count: 1, cents: -2_200 });
  });

  it("shows the amounts without sign, so a refund on a revenue is hidden, and says so", async () => {
    await move("2.1 da soci e tesserati", -400);
    const { rows, issues } = await statement();
    expect(rowOf(rows, 4)).toMatchObject({ cents: -400, partialCents: 400 });
    expect(issues.filter((i) => i.kind === "wrongSign").map((i) => i.row)).toEqual([3, 4, 17, 27]);
  });

  it("tells about the movements that no row counts: with no Voce, and with a Voce of the register the table does not have", async () => {
    await move(null, 1_500);
    await move("9.4 Pec aruba", -600);
    const { rows, issues } = await statement();
    expect(rowOf(rows, 27).cents).toBe(0);
    expect(rowOf(rows, 68).cents).toBe(0);
    expect(issues).toContainEqual({ kind: "noVoce", row: null, label: "", count: 1, cents: 1_500 });
    expect(issues).toContainEqual({ kind: "unknownVoce", row: null, label: "9.4 Pec aruba", count: 1, cents: -600 });
  });
});
