import type { ToPayStatus } from "../../core/calcTypes";
import { sortRows, type SortAccessors, type SortState } from "../../core/sort";
import type { PurchaseOrder, ToPayRow } from "./types";

// TO PAY with its orders (docs/registro-di-cassa.md, §5.4bis): the lines bought in one order are one row of the table, with the sums of
// its lines, that opens to show them. The rest of the lines stay rows of their own.

/** What a row of TO PAY shows in the columns the table sorts by, for a line and for an order. */
interface Columns {
  item: string;
  projectName: string | null;
  supplierName: string | null;
  purchaseDate: string | null;
  daysWaiting: number | null;
  dueCents: number;
  paidCents: number;
  status: ToPayStatus;
}

/**
 * An order as a row of TO PAY: its name in LINE, the lines of it still to pay (only those are in TO PAY) and their sums. The project
 * and the supplier are there when all its lines have the same one; the earliest purchase and the longest wait.
 */
export interface OrderRow extends Columns {
  orderId: number;
  seasonId: number;
  seasonName: string;
  lines: ToPayRow[];
  projects: string[];
  areas: string[];
  suppliers: string[];
  overpaidCents: number;
  /** The person may rename the order and ungroup it. */
  canChange: boolean;
}

export type ToPayEntry = ToPayRow | OrderRow;

export const isOrder = (entry: ToPayEntry): entry is OrderRow => "lines" in entry;

/** How TO PAY sorts its rows, the orders among the lines and the lines inside an order. */
export const SORT: SortAccessors<Columns> = {
  item: (r) => r.item,
  project: (r) => r.projectName,
  supplier: (r) => r.supplierName,
  boughtOn: (r) => r.purchaseDate,
  waiting: (r) => r.daysWaiting,
  due: (r) => r.dueCents,
  paid: (r) => r.paidCents,
  state: (r) => r.status,
};

/** The state of an order, from its lines: overpaid if one of them is, part paid if anything is paid, planned if all of them are. */
export function orderStatus(lines: ToPayRow[]): ToPayStatus {
  if (lines.some((l) => l.status === "over")) return "over";
  if (lines.some((l) => l.paidCents > 0)) return "partial";
  return lines.every((l) => l.status === "planned") ? "planned" : "due";
}

const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => v !== null))];
const sum = (lines: ToPayRow[], cents: (l: ToPayRow) => number) => lines.reduce((total, l) => total + cents(l), 0);

function orderRow(order: PurchaseOrder | undefined, lines: ToPayRow[]): OrderRow {
  const first = lines[0]!;
  const projects = distinct(lines.map((l) => l.projectName));
  const suppliers = distinct(lines.map((l) => l.supplierName));
  const dates = distinct(lines.map((l) => l.purchaseDate)).sort();
  const waits = lines.map((l) => l.daysWaiting).filter((d): d is number => d !== null);
  return {
    orderId: first.orderId!,
    item: order?.name ?? first.orderName ?? "",
    seasonId: first.seasonId,
    seasonName: first.seasonName,
    lines,
    projects,
    areas: distinct(lines.map((l) => l.areaName)),
    suppliers,
    projectName: projects.length === 1 ? projects[0]! : null,
    supplierName: suppliers.length === 1 ? suppliers[0]! : null,
    purchaseDate: dates[0] ?? null,
    daysWaiting: waits.length > 0 ? Math.max(...waits) : null,
    dueCents: sum(lines, (l) => l.dueCents),
    paidCents: sum(lines, (l) => l.paidCents),
    overpaidCents: sum(lines, (l) => l.overpaidCents),
    status: orderStatus(lines),
    canChange: order?.canChange ?? false,
  };
}

/** The words a search looks in: of a line, its order's name too; of an order, its name and every line of it. */
const words = (entry: ToPayEntry): string =>
  isOrder(entry)
    ? [entry.item, ...entry.lines.map(words)].join(" ")
    : `${entry.item} ${entry.projectName} ${entry.supplierName ?? ""} ${entry.orderName ?? ""}`;

/**
 * The rows of TO PAY: an order for the lines in one (where its first line was), the other lines as they are; only those with `text`
 * in them, in the order of `sort` (the lines inside an order too).
 */
export function toPayEntries(rows: ToPayRow[], orders: PurchaseOrder[], text: string, sort: SortState | null): ToPayEntry[] {
  const lines = new Map<number, ToPayRow[]>();
  for (const row of rows) if (row.orderId !== null) lines.set(row.orderId, [...(lines.get(row.orderId) ?? []), row]);
  const seen = new Set<number>();
  const entries = rows.flatMap((row): ToPayEntry[] => {
    if (row.orderId === null) return [row];
    if (seen.has(row.orderId)) return [];
    seen.add(row.orderId);
    return [orderRow(orders.find((o) => o.id === row.orderId), sortRows(lines.get(row.orderId)!, SORT, sort))];
  });
  const wanted = text.trim().toLowerCase();
  return sortRows(wanted === "" ? entries : entries.filter((e) => words(e).toLowerCase().includes(wanted)), SORT, sort);
}
