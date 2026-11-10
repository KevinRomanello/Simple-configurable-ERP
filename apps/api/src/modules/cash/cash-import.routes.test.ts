import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

let row = 5;
const line = (on: string, description: string, account: string, cents: number, extra: object = {}) => ({
  row: row++, on, description, category: null, method: null, invoiceChecked: false, account, cents, ...extra,
});
const sheet = (rows: object[], opening: object | null = { label: "saldo al 01/01/2026", cents: { cash: 38_500, bank: 1_000_000, paypal: 0 } }) => ({
  sheetName: "movimenti cassa e banca", opening, rows,
});
const entries = async (year = 2026) => (await api.get(`/api/cash/register?year=${year}`)).body;

/** A small sheet of 2026 with a Voce of the site, one of its own, a method of the site, and a typo of 2025. */
function sample() {
  row = 5;
  return [
    line("2026-01-02", "Bollo", "bank", -851, { category: "8.2 Imposta di bollo", method: "Automatico" }),
    line("2026-01-08", "Sponsor payment", "bank", 500_000, { category: "6.1 Da pubblicità e sponsorizzazioni", method: "Completato bonifico", invoiceChecked: true }),
    line("2026-01-09", "Membership fee", "cash", 2_000, { category: "1. QUOTE ASSOCIATIVE" }),
    line("2026-01-12", "Saldo fattura", "bank", -12_000, { category: "9.9 Voce nuova", method: "Metodo nuovo" }),
    line("2026-01-13", "Commissione sepa", "bank", -25, { category: "7.1 Commissioni e spese tenuta conto" }),
    line("2026-01-13", "Commissione sepa", "bank", -25, { category: "7.1 Commissioni e spese tenuta conto" }),
    line("2025-05-18", "Typo of the year", "bank", -999),
    line("2026-01-20", "No Voce", "paypal", 2_800),
  ];
}

describe("the check of a sheet (saves nothing)", () => {
  it("says what is new, what the register would hold, and what it does not know yet", async () => {
    const answer = await api.post("/api/cash/import/preview", sheet(sample()));
    expect(answer.status).toBe(200);
    const p = answer.body;
    expect(p).toMatchObject({ year: 2026, same: 0, changedCount: 0, addedCount: 7, onlySite: 0, noCategory: 1, hasOpening: true });
    expect(p.rows).toEqual({ total: 8, used: 7, outsideYear: 1 });
    expect(p.years).toEqual([{ year: 2025, rows: 1 }, { year: 2026, rows: 7 }]);
    expect(p.outside).toEqual([expect.objectContaining({ description: "Typo of the year" })]);
    expect(p.unknownCategories).toEqual([{ name: "9.9 Voce nuova", rows: 1 }]);
    expect(p.unknownMethods).toEqual([{ name: "Metodo nuovo", rows: 1 }]);
    expect(p.sponsorshipAdded).toBe(1);
    // the balances of the sheet: its opening plus its own rows of 2026; the register has nothing yet
    expect(p.balances.sheet).toEqual({ cash: 40_500, bank: 1_000_000 - 851 + 500_000 - 12_000 - 50, paypal: 2_800 });
    expect(p.balances.site).toEqual({ cash: 0, bank: 0, paypal: 0 });
    expect((await entries()).entries).toEqual([]); // nothing was saved
    expect((await api.get("/api/cash/categories")).body).toHaveLength(48);
  });

  it("the rows of another year are left out, loaded in their own year, or counted in the year of the sheet; a year can be chosen", async () => {
    const checked = (await api.post("/api/cash/import/preview", sheet(sample()))).body;
    expect(checked.outsideEffect).toEqual({ cash: 0, bank: -999, paypal: 0 }); // what leaving them out costs in the balances
    const own = (await api.post("/api/cash/import/preview", { ...sheet(sample()), outside: "own" })).body;
    expect(own.rows).toMatchObject({ used: 8, outsideYear: 1 });
    expect(own.addedCount).toBe(7); // the check counts the year being checked; the typo stays in 2025
    const moved = (await api.post("/api/cash/import/preview", { ...sheet(sample()), outside: "year" })).body;
    expect(moved).toMatchObject({ addedCount: 8, rows: { used: 8 } });
    expect(moved.balances.sheet.bank).toBe(checked.balances.sheet.bank - 999); // now in the 2026 balances, like the sheet
    const other = (await api.post("/api/cash/import/preview", { ...sheet(sample()), year: 2025 })).body;
    expect(other).toMatchObject({ year: 2025, addedCount: 1 });
  });

  it("is for the treasury and the admins", async () => {
    for (const person of [{ email: "pm@team.test", role: "pm" as const, areas: ["sw"] }, { email: "v@team.test", role: "viewer" as const }]) {
      expect((await api.as(person).post("/api/cash/import/preview", sheet(sample()))).status).toBe(403);
      expect((await api.as(person).post("/api/cash/import", { ...sheet(sample()), mode: "add" })).status).toBe(403);
    }
    expect((await api.as({ email: "t@team.test", role: "pm", treasury: true }).post("/api/cash/import/preview", sheet(sample()))).status).toBe(200);
  });

  it("refuses rows that cannot be a movement", async () => {
    const bad = async (patch: object) => (await api.post("/api/cash/import/preview", sheet([{ ...sample()[0], ...patch }]))).status;
    expect(await bad({ cents: 0 })).toBe(400);
    expect(await bad({ cents: 1.5 })).toBe(400);
    expect(await bad({ on: "2026-02-30" })).toBe(400);
    expect(await bad({ account: "wallet" })).toBe(400);
    expect(await bad({ description: "x".repeat(2_001) })).toBe(400);
  });
});

describe("adding what is missing", () => {
  const add = (body: object = {}) => api.post("/api/cash/import", { ...sheet(sample()), mode: "add", ...body });

  it("puts the rows of the year in, in the order of the sheet, with their Voci, methods and opening balances", async () => {
    const done = await add();
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ mode: "add", year: 2026, added: 7, deleted: 0, updated: 0, openings: 3 });
    const r = await entries();
    expect(r.entries.map((e: any) => [e.on, e.description, e.cents])).toEqual([
      ["2026-01-02", "Bollo", -851],
      ["2026-01-08", "Sponsor payment", 500_000],
      ["2026-01-09", "Membership fee", 2_000],
      ["2026-01-12", "Saldo fattura", -12_000],
      ["2026-01-13", "Commissione sepa", -25],
      ["2026-01-13", "Commissione sepa", -25],
      ["2026-01-20", "No Voce", 2_800],
    ]);
    expect(r.opening).toEqual({ cash: 38_500, bank: 1_000_000, paypal: 0 });
    expect(r.closing).toEqual({ cash: 40_500, bank: 1_000_000 - 851 + 500_000 - 12_000 - 50, paypal: 2_800 });
    // the sponsorship box follows the Voce of the sheet: 6.1 is sponsorship, the membership fee is not
    expect(r.entries.map((e: any) => e.sponsorship)).toEqual([false, true, false, false, false, false, false]);
    expect(r.entries[1].invoiceChecked).toBe(true);
    // the Voce and the method the site did not have were created, at the end of their lists
    expect((await api.get("/api/cash/categories")).body.at(-1)).toMatchObject({ name: "9.9 Voce nuova", usedBy: 1, sponsorship: false });
    expect((await api.get("/api/cash/methods")).body.at(-1)).toMatchObject({ name: "Metodo nuovo", usedBy: 1 });
  });

  it("can be repeated: the second time the check finds everything and nothing is added", async () => {
    await add();
    const again = (await api.post("/api/cash/import/preview", sheet(sample()))).body;
    expect(again).toMatchObject({ same: 7, addedCount: 0, changedCount: 0, onlySite: 0, unknownCategories: [], unknownMethods: [] });
    expect((await add()).body).toMatchObject({ added: 0, openings: 0 });
    expect((await entries()).entries).toHaveLength(7);
  });

  it("adds only what is missing, never deletes what the sheet does not have, and leaves a typed opening alone", async () => {
    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: "5" });
    await api.post("/api/cash/entries", { on: "2026-02-01", description: "Typed in the site", account: "cash", direction: "in", amount: "7" });
    await api.post("/api/cash/entries", { on: "2026-01-02", description: "bollo", account: "bank", direction: "out", amount: "8.51", categoryId: null });
    const check = (await api.post("/api/cash/import/preview", sheet(sample()))).body;
    // "bollo" is the sheet's "Bollo": same day, account and amount, with a Voce and a method the site's row lacks
    expect(check).toMatchObject({ same: 0, changedCount: 1, addedCount: 6, onlySite: 1 });
    expect(check.changed[0]).toMatchObject({ fields: ["category", "method"], description: "Bollo", siteDescription: "bollo" });
    const done = await add();
    expect(done.body).toMatchObject({ added: 6, deleted: 0, updated: 0, openings: 2 }); // bank was typed
    const r = await entries();
    expect(r.entries).toHaveLength(8);
    expect(r.entries.find((e: any) => e.description === "Typed in the site")).toBeTruthy();
    expect(r.opening.bank).toBe(500); // the opening typed in the site stays
    expect(r.entries.find((e: any) => e.description === "bollo").categoryId).toBeNull(); // changed rows are left as they are...
  });

  it("...unless asked to change them too", async () => {
    await api.post("/api/cash/entries", { on: "2026-01-02", description: "bollo", account: "bank", direction: "out", amount: "8.51" });
    const done = await add({ updateChanged: true });
    expect(done.body.updated).toBe(1);
    const bollo = (await entries()).entries.find((e: any) => e.on === "2026-01-02");
    expect(bollo.description).toBe("Bollo");
    expect(bollo.categoryId).not.toBeNull();
  });

  it("loads the rows of another year only if asked: in their own year, or in the year of the sheet", async () => {
    await add({ outside: "own" });
    expect((await entries(2025)).entries.map((e: any) => e.description)).toEqual(["Typo of the year"]);
    expect((await entries(2026)).entries).toHaveLength(7);
    await resetData();
    await add({ outside: "year" });
    expect((await entries(2025)).entries).toEqual([]);
    const moved = (await entries(2026)).entries.find((e: any) => e.description === "Typo of the year");
    expect(moved).toMatchObject({ on: "2026-05-18", cents: -999 });
    expect((await entries(2026)).closing.bank).toBe(1_000_000 - 851 + 500_000 - 12_000 - 50 - 999);
    // and it can be repeated: the moved row is found as the same
    expect((await api.post("/api/cash/import/preview", { ...sheet(sample()), outside: "year" })).body).toMatchObject({ same: 8, addedCount: 0 });
  });

  it("maps a Voce of the sheet to one the site has instead of creating it; a wrong one is refused", async () => {
    const voce = (await api.get("/api/cash/categories")).body.find((c: any) => c.name === "1.4 Altro");
    expect((await add({ categoryMap: { "9.9 Voce nuova": voce.id } })).status).toBe(200);
    expect((await api.get("/api/cash/categories")).body).toHaveLength(48);
    expect((await api.get("/api/cash/categories")).body.find((c: any) => c.name === "1.4 Altro").usedBy).toBe(1);
    await resetData();
    expect((await add({ categoryMap: { "9.9 Voce nuova": 99_999 } })).status).toBe(400);
    expect((await entries()).entries).toEqual([]); // all or nothing
  });
});

describe("replacing the year", () => {
  const replace = (body: object = {}) => api.post("/api/cash/import", { ...sheet(sample()), mode: "replace", confirmYear: 2026, ...body });

  it("deletes the year's movements and loads the sheet as it is, with its opening balances; other years stay", async () => {
    await api.post("/api/cash/entries", { on: "2026-03-03", description: "Will go", account: "cash", direction: "out", amount: "9" });
    await api.post("/api/cash/entries", { on: "2025-12-31", description: "Last year", account: "cash", direction: "in", amount: "9" });
    await api.put("/api/cash/openings", { year: 2026, account: "paypal", amount: "77" });
    const done = await replace();
    expect(done.body).toMatchObject({ mode: "replace", year: 2026, added: 7, deleted: 1, openings: 3 });
    const r = await entries();
    expect(r.entries.map((e: any) => e.description)).not.toContain("Will go");
    expect(r.entries).toHaveLength(7);
    expect(r.opening).toEqual({ cash: 38_500, bank: 1_000_000, paypal: 0 });
    expect((await entries(2025)).entries.map((e: any) => e.description)).toEqual(["Last year"]);
    // and the check of the same sheet now finds everything
    expect((await api.post("/api/cash/import/preview", sheet(sample()))).body).toMatchObject({ same: 7, addedCount: 0 });
  });

  it("wants the year typed again, and records what it deleted in the history", async () => {
    const created = await api.post("/api/cash/entries", { on: "2026-03-03", description: "Will go", account: "cash", direction: "out", amount: "9" });
    expect((await replace({ confirmYear: undefined })).status).toBe(400);
    expect((await replace({ confirmYear: 2025 })).status).toBe(400);
    expect((await entries()).entries).toHaveLength(1);
    expect((await replace()).status).toBe(200);
    const history = (await api.get(`/api/audit?table=cash_entry&rowId=${created.body.id}`)).body.entries;
    expect(history.map((h: any) => h.action)).toEqual(["delete", "insert"]);
  });

  it("running it twice gives the same register (the way to follow a sheet that is still the master copy)", async () => {
    await replace();
    const first = await entries();
    await replace();
    const second = await entries();
    expect(second.entries.map((e: any) => [e.on, e.description, e.cents, e.balances])).toEqual(first.entries.map((e: any) => [e.on, e.description, e.cents, e.balances]));
  });
});
