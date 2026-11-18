import { describe, expect, it } from "vitest";
import type { CashAccount } from "./register";
import { financialStatement, voceKey, type StatementEntry, type StatementSpec } from "./statement";

// A small statement with what the real one has: a row that no sum adds up (the engine does not invent one), a section inside a section.
const LAYOUT: StatementSpec[] = [
  { row: 1, kind: "title", label: "IN" },
  { row: 2, kind: "voce", label: "A. Fees", bold: true },
  { row: 3, kind: "sum", label: "B. Gifts", of: [4, 5], total: false },
  { row: 4, kind: "voce", label: "B.1 Members", bold: false },
  { row: 5, kind: "voce", label: "B.2 Others", bold: false },
  { row: 6, kind: "voce", label: "B.3 Left alone", bold: false },
  { row: 7, kind: "sum", label: "TOTAL IN", of: [2, 3], total: true },
  { row: 8, kind: "blank" },
  { row: 9, kind: "title", label: "OUT" },
  { row: 10, kind: "sum", label: "C. Taxes", of: [11, 12], total: false },
  { row: 11, kind: "voce", label: "C.1 Stamp", bold: false },
  { row: 12, kind: "sum", label: "D. VAT", of: [13], total: false },
  { row: 13, kind: "voce", label: "D.1 Credit", bold: false },
  { row: 14, kind: "sum", label: "TOTAL OUT", of: [10], total: true },
  { row: 15, kind: "blank" },
  { row: 16, kind: "result", label: "RESULT", plus: 7, minus: 14 },
];

const move = (voce: string | null, cents: number, account: CashAccount = "bank"): StatementEntry => ({ voce, account, cents });
const rowOf = (rows: ReturnType<typeof financialStatement>, row: number) => rows.find((r) => r.row === row)!;

describe("financialStatement", () => {
  it("adds up the movements of each Voce, money out against money in, and the rows above them", () => {
    const rows = financialStatement(
      [move("A. Fees", 5_000), move("B.1 Members", 2_000, "cash"), move("B.2 Others", 500), move("C.1 Stamp", -1_600), move("D.1 Credit", -400)],
      LAYOUT,
    );
    expect(rowOf(rows, 2)).toMatchObject({ cents: 5_000, partialCents: 5_000, bold: true });
    expect(rowOf(rows, 3)).toMatchObject({ cents: 2_500 });
    expect(rowOf(rows, 7)).toMatchObject({ cents: 7_500, total: true });
    expect(rowOf(rows, 10)).toMatchObject({ cents: -2_000, partialCents: 2_000 });
    expect(rowOf(rows, 16)).toMatchObject({ cents: null, partialCents: 5_500 });
  });

  it("finds the Voce by its name whatever the capitals and the spaces, as the sheet does", () => {
    expect(voceKey("  4.2 da Comunità  EUROPEA ")).toBe(voceKey("4.2 da comunità europea"));
    const rows = financialStatement([move(" b.1   MEMBERS", 300)], LAYOUT);
    expect(rowOf(rows, 4).cents).toBe(300);
  });

  it("counts the movements of every account in every row, the Paypal ones too", () => {
    const rows = financialStatement([move("A. Fees", 1_000, "paypal"), move("A. Fees", 200, "cash"), move("A. Fees", 50, "bank"), move("B.1 Members", 40, "paypal")], LAYOUT);
    expect(rowOf(rows, 2).cents).toBe(1_250);
    expect(rowOf(rows, 4).cents).toBe(40);
  });

  it("shows the amounts without sign, and the result as the revenues minus the costs without sign", () => {
    const rows = financialStatement([move("A. Fees", 100), move("C.1 Stamp", -300)], LAYOUT);
    expect(rowOf(rows, 10)).toMatchObject({ cents: -300, partialCents: 300 });
    expect(rowOf(rows, 16).partialCents).toBe(-200);
  });

  it("does not count a row that no sum adds up, nor the movements with no Voce or a Voce no row reads", () => {
    const rows = financialStatement([move("B.3 Left alone", 900), move(null, 700), move("Unknown", 600)], LAYOUT);
    expect(rowOf(rows, 6).cents).toBe(900);
    expect(rowOf(rows, 7).cents).toBe(0);
  });

  it("keeps the layout's blank rows and titles without amounts", () => {
    const rows = financialStatement([], LAYOUT);
    expect(rows.map((r) => r.row)).toEqual(LAYOUT.map((s) => s.row));
    expect(rowOf(rows, 8)).toMatchObject({ kind: "blank", label: "", cents: null, partialCents: null, bold: false });
    expect(rowOf(rows, 1)).toMatchObject({ kind: "title", label: "IN", bold: true, cents: null });
  });
});
