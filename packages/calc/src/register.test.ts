import { describe, expect, it } from "vitest";
import { balancesAt, matchRegister, normalizeText, registerTimeline, totalOf, type Opening, type RegisterEntry, type SheetEntry, type SiteEntry } from "./register";

let nextId = 1;
const entry = (on: string, account: RegisterEntry["account"], cents: number, extra: Partial<RegisterEntry> = {}): RegisterEntry => ({
  id: nextId++, on, description: "", categoryId: null, methodId: null, account, cents, invoiceChecked: false, sponsorship: false, ...extra,
});

describe("registerTimeline", () => {
  const openings: Opening[] = [{ year: 2026, account: "cash", cents: 38_500 }, { year: 2026, account: "bank", cents: 6_059_926 }];

  it("runs each account on its own, by day and then by order of entry, from the opening balances", () => {
    const entries = [entry("2026-01-08", "bank", -25), entry("2026-01-02", "bank", -851), entry("2026-01-08", "paypal", 2_800), entry("2026-01-08", "cash", 2_500)];
    const { rows } = registerTimeline(entries, openings);
    expect(rows.map((r) => [r.entry.on, r.entry.account])).toEqual([["2026-01-02", "bank"], ["2026-01-08", "bank"], ["2026-01-08", "paypal"], ["2026-01-08", "cash"]]);
    expect(rows.at(-1)!.balances).toEqual({ cash: 41_000, bank: 6_059_050, paypal: 2_800 });
    expect(totalOf(rows.at(-1)!.balances)).toBe(41_000 + 6_059_050); // Paypal stays apart
  });

  it("a year starts where the one before ended; an opening typed for an account replaces that account's carry-over only", () => {
    const entries = [entry("2025-06-01", "bank", 1_000), entry("2025-06-01", "cash", 500), entry("2026-02-01", "bank", -100)];
    const { years } = registerTimeline(entries, [{ year: 2025, account: "bank", cents: 10_000 }, { year: 2026, account: "cash", cents: 0 }]);
    expect(years.get(2025)).toEqual({ opening: { cash: 0, bank: 10_000, paypal: 0 }, closing: { cash: 500, bank: 11_000, paypal: 0 } });
    expect(years.get(2026)).toEqual({ opening: { cash: 0, bank: 11_000, paypal: 0 }, closing: { cash: 0, bank: 10_900, paypal: 0 } });
  });

  it("has nothing for no movements and no openings", () => {
    expect(registerTimeline([], []).rows).toEqual([]);
  });
});

describe("balancesAt", () => {
  const entries = [entry("2026-01-05", "bank", 1_000), entry("2026-03-01", "bank", -300), entry("2026-03-01", "cash", 50)];
  const openings: Opening[] = [{ year: 2026, account: "bank", cents: 5_000 }];

  it("is what the accounts held at the end of the day, movements of that day included", () => {
    expect(balancesAt(entries, openings, "2026-01-04")).toEqual({ cash: 0, bank: 5_000, paypal: 0 });
    expect(balancesAt(entries, openings, "2026-03-01")).toEqual({ cash: 50, bank: 5_700, paypal: 0 });
    expect(balancesAt(entries, openings, "2030-01-01")).toEqual({ cash: 50, bank: 5_700, paypal: 0 });
  });

  it("is null when the register cannot say, so a BANK written by hand stays in charge: before its first opening balance, or with none", () => {
    expect(balancesAt(entries, openings, "2025-12-31")).toBeNull();
    expect(balancesAt([], [], "2026-01-01")).toBeNull();
    expect(balancesAt(entries, [], "2026-06-01")).toBeNull(); // movements with no opening balance are not a balance
    expect(balancesAt([entry("2025-05-18", "bank", -999), ...entries], openings, "2025-12-31")).toBeNull(); // a stray movement of the year before
    expect(balancesAt([], openings, "2026-01-01")).toEqual({ cash: 0, bank: 5_000, paypal: 0 });
  });
});

describe("normalizeText", () => {
  it("ignores case, extra spaces and the kind of apostrophe", () => {
    expect(normalizeText("  Entrate  da ATTIVITA’ commerciali ")).toBe(normalizeText("entrate da attivita' commerciali"));
    expect(normalizeText(null)).toBe("");
  });
});

describe("matchRegister", () => {
  let row = 5;
  const sheet = (on: string, account: SheetEntry["account"], cents: number, description: string, extra: Partial<SheetEntry> = {}): SheetEntry => ({
    row: row++, on, description, category: null, method: null, account, cents, invoiceChecked: false, ...extra,
  });
  const site = (id: number, on: string, account: SiteEntry["account"], cents: number, description: string, extra: Partial<SiteEntry> = {}): SiteEntry => ({
    id, on, description, category: null, method: null, account, cents, invoiceChecked: false, ...extra,
  });

  it("knows what is already there, what is new, what differs and what only the site has", () => {
    row = 5;
    const rows = [
      sheet("2026-01-02", "bank", -851, "Bollo"), // same
      sheet("2026-01-08", "bank", -10_085, "Provini"), // same day, account and amount, another text
      sheet("2026-01-09", "cash", 2_500, "Felpa"), // new
    ];
    const entries = [site(1, "2026-01-02", "bank", -851, "bollo "), site(2, "2026-01-08", "bank", -10_085, "Provini per prova"), site(3, "2026-01-20", "bank", 100, "Only here")];
    expect(matchRegister(rows, entries)).toEqual({
      same: 1,
      changed: [{ row: 6, entryId: 2, fields: ["description"] }],
      added: [7],
      onlySite: [3],
    });
  });

  it("counts repetitions: two identical fees on a day are two movements, and a third in the sheet is new", () => {
    row = 5;
    const fee = (extra = {}) => sheet("2026-01-13", "bank", -25, "Commissione sepa", extra);
    expect(matchRegister([fee(), fee()], [site(1, "2026-01-13", "bank", -25, "Commissione sepa"), site(2, "2026-01-13", "bank", -25, "Commissione sepa")])).toMatchObject({ same: 2, added: [], onlySite: [] });
    row = 5;
    expect(matchRegister([fee(), fee(), fee()], [site(1, "2026-01-13", "bank", -25, "Commissione sepa"), site(2, "2026-01-13", "bank", -25, "Commissione sepa")])).toMatchObject({ same: 2, added: [7] });
    row = 5;
    expect(matchRegister([fee()], [site(1, "2026-01-13", "bank", -25, "Commissione sepa"), site(2, "2026-01-13", "bank", -25, "Commissione sepa")])).toMatchObject({ same: 1, onlySite: [2] });
  });

  it("a different Voce, method or invoice box makes the movement 'changed', not new", () => {
    row = 5;
    const rows = [sheet("2026-02-01", "bank", -500, "Acquisto", { category: "1.1 Attrezzature", method: "Paypal", invoiceChecked: true })];
    const entries = [site(9, "2026-02-01", "bank", -500, "Acquisto", { category: "1.4 Altro", method: "Paypal", invoiceChecked: false })];
    expect(matchRegister(rows, entries)).toEqual({ same: 0, changed: [{ row: 5, entryId: 9, fields: ["category", "invoiceChecked"] }], added: [], onlySite: [] });
  });

  it("running it twice over what it added finds nothing new (the import can be repeated)", () => {
    row = 5;
    const rows = [sheet("2026-02-01", "cash", 100, "A"), sheet("2026-02-02", "bank", -50, "B", { category: "7.1 Commissioni" })];
    const added = rows.map((r, i) => site(i + 1, r.on, r.account, r.cents, r.description, { category: r.category }));
    expect(matchRegister(rows, added)).toEqual({ same: 2, changed: [], added: [], onlySite: [] });
  });
});
