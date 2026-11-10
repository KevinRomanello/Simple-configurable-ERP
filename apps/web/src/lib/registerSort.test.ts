import { describe, expect, it } from "vitest";
import type { CashEntryRow, CashListItem } from "../api/types";
import { registerSort } from "./registerSort";
import { sortRows } from "./sort";

const voci: CashListItem[] = [{ id: 1, name: "2.1 Soci", usedBy: 0 }, { id: 2, name: "1.1 Attrezzature", usedBy: 0 }];
const methods: CashListItem[] = [{ id: 1, name: "Bonifico", usedBy: 0 }];
const zero = { cash: 0, bank: 0, paypal: 0 };

// invented movements: id, day, account, signed cents
function entry(id: number, on: string, account: CashEntryRow["account"], cents: number, extra: Partial<CashEntryRow> = {}): CashEntryRow {
  return {
    id, on, description: `m${id}`, categoryId: null, methodId: null, account, cents, invoiceChecked: false, sponsorship: false,
    balances: { ...zero, [account]: cents }, total: cents, inflow: null, lines: [], ...extra,
  };
}
const rows = [
  entry(1, "2026-03-02", "bank", 5000),
  entry(2, "2026-03-01", "cash", -1200, { categoryId: 1, description: "" }),
  entry(3, "2026-03-03", "bank", -300, { categoryId: 2, methodId: 1, invoiceChecked: true }),
  entry(4, "2026-03-04", "paypal", 800, { sponsorship: true }),
];
const idsBy = (key: string, direction: 1 | -1 = 1) => sortRows(rows, registerSort(voci, methods), { key, direction }).map((e) => e.id);

describe("the register sorts by every column", () => {
  it("by day, and by text with the empty ones last in both directions", () => {
    expect(idsBy("on")).toEqual([2, 1, 3, 4]);
    expect(idsBy("on", -1)).toEqual([4, 3, 1, 2]);
    expect(idsBy("description")).toEqual([1, 3, 4, 2]); // the movement without a description is last
    expect(idsBy("description", -1)).toEqual([4, 3, 1, 2]);
  });

  it("by Voce and by method with the names, not the ids", () => {
    expect(idsBy("voce")).toEqual([3, 2, 1, 4]); // "1.1 Attrezzature" before "2.1 Soci"; no Voce last
    expect(idsBy("method")).toEqual([3, 1, 2, 4]);
  });

  it("by the boxes", () => {
    expect(idsBy("invoice", -1)[0]).toBe(3);
    expect(idsBy("sponsorship", -1)[0]).toBe(4);
  });

  it("an account's money in and out only count on its own movements; the others are empty and last", () => {
    expect(idsBy("bank.in")).toEqual([1, 2, 3, 4]); // only movement 1 has money in on the bank
    expect(idsBy("bank.out")).toEqual([3, 1, 2, 4]);
    expect(idsBy("cash.out")).toEqual([2, 1, 3, 4]);
    expect(idsBy("paypal.in", -1)).toEqual([4, 1, 2, 3]);
  });

  it("by the balance of an account after the movement and by the total", () => {
    expect(idsBy("bank.balance")).toEqual([3, 2, 4, 1]); // -300, 0, 0, 5000 (equal rows keep their order)
    expect(idsBy("total", -1)).toEqual([1, 4, 3, 2]);
  });

  it("without a choice the rows are as they came", () => {
    expect(sortRows(rows, registerSort(voci, methods), null).map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });
});
