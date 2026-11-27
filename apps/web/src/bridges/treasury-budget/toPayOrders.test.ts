import { describe, expect, it } from "vitest";
import { isOrder, orderStatus, toPayEntries, type OrderRow } from "./toPayOrders";
import type { PurchaseOrder, ToPayRow } from "./types";

// TO PAY with its orders (docs/registro-di-cassa.md, §5.4bis): the lines bought in one order are one row, with the sums of its lines.

let next = 1;
/** A line of TO PAY, to pay in full, bought from Acme on the 1st of October; `over` changes only what is given. */
function line(over: Partial<ToPayRow> = {}): ToPayRow {
  const lineId = next++;
  return {
    lineId,
    item: `Item ${lineId}`,
    category: null,
    projectId: 1,
    projectName: "Chassis",
    areaId: 1,
    areaCode: "mt",
    areaName: "MT",
    supplierName: "Acme",
    purchaseDate: "2026-10-01",
    vatDueDate: null,
    teamFundCents: 1000,
    teamVatCents: 220,
    paidCents: 0,
    unpaidFundCents: 1000,
    unpaidVatCents: 220,
    dueCents: 1220,
    overpaidCents: 0,
    daysWaiting: 10,
    status: "due",
    seasonId: 1,
    seasonName: "2026-2027",
    suggestedCategoryId: null,
    orderId: null,
    orderName: null,
    canGroup: true,
    ...over,
  };
}
const AMAZON: PurchaseOrder = { id: 7, name: "Amazon US", seasonId: 1, canChange: true };
const inAmazon = { orderId: 7, orderName: "Amazon US" };
const names = (entries: ReturnType<typeof toPayEntries>) => entries.map((e) => e.item);

describe("the rows of TO PAY with the orders", () => {
  it("makes one row of the lines of an order, where its first line was, with the sums of its lines", () => {
    const loose = line({ item: "Loose" });
    const a = line({ item: "Sensor", ...inAmazon, purchaseDate: "2026-10-03", daysWaiting: 8, dueCents: 500, paidCents: 0 });
    const b = line({ item: "Cable", ...inAmazon, projectName: "Engine", purchaseDate: "2026-09-28", daysWaiting: 13, dueCents: 700, paidCents: 300, status: "partial" });
    const entries = toPayEntries([a, loose, b], [AMAZON], "", null);
    expect(names(entries)).toEqual(["Amazon US", "Loose"]);
    const order = entries[0] as OrderRow;
    expect(isOrder(order)).toBe(true);
    expect(order).toMatchObject({
      orderId: 7,
      lines: [a, b],
      projects: ["Chassis", "Engine"],
      areas: ["MT"],
      projectName: null, // two projects: the column says how many
      supplierName: "Acme", // one supplier for all of them
      purchaseDate: "2026-09-28", // the earliest
      daysWaiting: 13, // the longest wait
      dueCents: 1200,
      paidCents: 300,
      status: "partial",
      canChange: true,
    });
  });

  it("gives an order the state of its lines: overpaid, part paid, planned when all are, else to pay", () => {
    expect(orderStatus([line({ status: "over", overpaidCents: 5 }), line({ status: "partial", paidCents: 1 })])).toBe("over");
    expect(orderStatus([line({ status: "planned" }), line({ status: "partial", paidCents: 1 })])).toBe("partial");
    expect(orderStatus([line({ status: "planned" }), line({ status: "planned" })])).toBe("planned");
    expect(orderStatus([line({ status: "planned" }), line({ status: "due" })])).toBe("due");
  });

  it("finds an order by its name and by any of its lines, and a line by the name of its order", () => {
    const rows = [line({ item: "Sensor", ...inAmazon }), line({ item: "Cable", ...inAmazon }), line({ item: "Bolt", supplierName: "Bossard" })];
    expect(names(toPayEntries(rows, [AMAZON], "amazon", null))).toEqual(["Amazon US"]);
    // the order shows with all its lines, not only the one that matched
    const found = toPayEntries(rows, [AMAZON], "cable", null);
    expect(names(found)).toEqual(["Amazon US"]);
    expect((found[0] as OrderRow).lines).toHaveLength(2);
    expect(names(toPayEntries(rows, [AMAZON], "bossard", null))).toEqual(["Bolt"]);
  });

  it("sorts the orders among the lines, and the lines inside an order, by the same column", () => {
    const rows = [line({ item: "Zeta", ...inAmazon, dueCents: 100 }), line({ item: "Alpha", ...inAmazon, dueCents: 900 }), line({ item: "Middle", dueCents: 500 })];
    const byDue = toPayEntries(rows, [AMAZON], "", { key: "due", direction: -1 });
    expect(names(byDue)).toEqual(["Amazon US", "Middle"]); // the order owes 1000
    expect((byDue[0] as OrderRow).lines.map((l) => l.item)).toEqual(["Alpha", "Zeta"]);
    expect(names(toPayEntries(rows, [AMAZON], "", { key: "item", direction: 1 }))).toEqual(["Amazon US", "Middle"]);
  });

  it("lets only who may change the order rename or ungroup it, and leaves the lines without an order as they are", () => {
    const rows = [line({ ...inAmazon }), line({ ...inAmazon }), line()];
    const entries = toPayEntries(rows, [{ ...AMAZON, canChange: false }], "", null);
    expect((entries[0] as OrderRow).canChange).toBe(false);
    expect(entries[1]).toBe(rows[2]);
    expect(isOrder(entries[1]!)).toBe(false);
  });
});
