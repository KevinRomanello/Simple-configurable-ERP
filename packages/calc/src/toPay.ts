import { daysBetween } from "./dates";
import type { CalcLine } from "./lines";

// The page TO PAY (docs/registro-di-cassa.md): the lines of the budget bought (ACTUAL) that the team
// has not paid yet, for the part the team pays: the net out of its fund and the VAT it owes.

export type ToPayStatus =
  /** the purchase date has come (or there is none) and nothing is paid */
  | "due"
  /** the purchase date is still to come */
  | "planned"
  /** something is paid and something is left */
  | "partial"
  /** more is paid than the team owes: the budget changed after the payment */
  | "over";

export interface ToPayLine {
  lineId: number;
  item: string;
  category: string | null;
  projectId: number;
  projectName: string;
  areaId: number;
  areaCode: string;
  areaName: string;
  supplierName: string | null;
  purchaseDate: string | null;
  /** The VAT the team owes is paid on this day; null when there is none to pay. */
  vatDueDate: string | null;
  /** What the team pays: the net out of its fund and the VAT. */
  teamFundCents: number;
  teamVatCents: number;
  paidCents: number;
  /** What is left, in the two parts. */
  unpaidFundCents: number;
  unpaidVatCents: number;
  dueCents: number;
  /** More than the team owes, when `status` is `over`. */
  overpaidCents: number;
  /** Days since the purchase date, or null without one. */
  daysWaiting: number | null;
  status: ToPayStatus;
}

/** The lines the team still has to pay (and those paid too much), the oldest purchase first. */
export function toPayLines(lines: CalcLine[], today: string): ToPayLine[] {
  const list: ToPayLine[] = [];
  for (const line of lines) {
    const p = line.actual;
    const owed = p.teamFundCents + p.teamVatCents;
    if (!p.figures || owed <= 0) continue;
    const dueCents = p.unpaidFundCents + p.unpaidVatCents;
    const overpaidCents = Math.max(0, p.paidCents - owed);
    if (dueCents <= 0 && overpaidCents <= 0) continue;

    const status: ToPayStatus =
      overpaidCents > 0 ? "over" : p.paidCents > 0 ? "partial" : p.purchaseDate !== null && p.purchaseDate > today ? "planned" : "due";
    list.push({
      lineId: line.id,
      item: line.item,
      category: line.category,
      projectId: line.projectId,
      projectName: line.projectName,
      areaId: line.areaId,
      areaCode: line.areaCode,
      areaName: line.areaName,
      supplierName: p.supplierName,
      purchaseDate: p.purchaseDate,
      vatDueDate: p.unpaidVatCents > 0 ? p.vatDueDate : null,
      teamFundCents: p.teamFundCents,
      teamVatCents: p.teamVatCents,
      paidCents: p.paidCents,
      unpaidFundCents: p.unpaidFundCents,
      unpaidVatCents: p.unpaidVatCents,
      dueCents,
      overpaidCents,
      daysWaiting: p.purchaseDate ? daysBetween(p.purchaseDate, today) : null,
      status,
    });
  }
  return list.sort((a, b) => (a.purchaseDate ?? "9999").localeCompare(b.purchaseDate ?? "9999") || a.lineId - b.lineId);
}
