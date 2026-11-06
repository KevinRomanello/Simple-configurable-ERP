import type { FiguresPatch, LinePatch } from "../api/client";
import type { CalcLine, Phase } from "../api/types";
import { choosesOwnRate, EMPTY_PHASE, type LineLookups, type PhaseDraft } from "./newLine";

// Changing a budget line from a form (on a phone, where the grid does not fit): the form starts from
// the line as it is, and sends only what was changed, with the version read, like a cell of the grid.

export const PHASES: readonly Phase[] = ["estimate", "actual"];

export interface EditDraft {
  item: string;
  category: string;
  priority: string;
  /** The season whose car the line is for, as its id; "" = the car of its own season. */
  car: string;
  estimate: PhaseDraft;
  actual: PhaseDraft;
}

/** "4.5" from 4500 thousandths, "0.0045" from 45 ten-thousandths: the exact number, as it is typed. */
export function decimalText(scaled: number, digits: number): string {
  const text = String(Math.abs(scaled)).padStart(digits + 1, "0");
  const fraction = text.slice(-digits).replace(/0+$/, "");
  return `${scaled < 0 ? "-" : ""}${text.slice(0, -digits)}${fraction ? `.${fraction}` : ""}`;
}

/** Paid by more than one fund (CASH FROM and ALSO FROM): the form shows them but does not change them. */
export const severalFunds = (line: CalcLine, phase: Phase) => (line[phase].figures?.fundIds.length ?? 0) > 1;

function phaseDraft(line: CalcLine, phase: Phase): PhaseDraft {
  const calc = line[phase];
  const figures = calc.figures;
  if (!figures) return EMPTY_PHASE;
  return {
    quantity: decimalText(figures.quantityMilli, 3),
    unitCost: decimalText(figures.unitCostE4, 4),
    fund: figures.fundIds.length === 1 ? (calc.fundName ?? "") : "",
    supplier: calc.supplierName ?? "",
    vatRate: figures.vatRate === null ? "" : String(figures.vatRate),
    purchaseDate: figures.purchaseDate ?? "",
    arrivalDate: figures.arrivalDate ?? "",
  };
}

/** The form of a line as it is now. */
export function editDraft(line: CalcLine): EditDraft {
  return {
    item: line.item,
    category: line.category ?? "",
    priority: line.priority ?? "",
    car: line.carSeasonId === null ? "" : String(line.carSeasonId),
    estimate: phaseDraft(line, "estimate"),
    actual: phaseDraft(line, "actual"),
  };
}

/**
 * What changed in a phase. An emptied quantity or cost is 0; an emptied fund, supplier, rate or date
 * is cleared. A name that is not in the lists (nothing chosen from them) is left as it was.
 */
function phasePatch(draft: PhaseDraft, before: PhaseDraft, several: boolean, lookups: LineLookups): FiguresPatch | undefined {
  const patch: FiguresPatch = {};
  if (draft.quantity !== before.quantity) patch.quantity = Number(draft.quantity || "0");
  if (draft.unitCost !== before.unitCost) patch.unitNetCost = Number(draft.unitCost || "0");
  if (draft.fund !== before.fund && !several) {
    const fund = lookups.fundByName.get(draft.fund.toLowerCase());
    if (draft.fund === "") patch.fundIds = [];
    else if (fund) patch.fundIds = [fund.id];
  }
  if (draft.supplier !== before.supplier) {
    const supplierId = lookups.supplierIdByName.get(draft.supplier.toLowerCase());
    if (draft.supplier === "") patch.supplierId = null;
    else if (supplierId !== undefined) patch.supplierId = supplierId;
  }
  if (draft.vatRate !== before.vatRate && choosesOwnRate(draft.fund, lookups)) patch.vatRate = draft.vatRate === "" ? null : Number(draft.vatRate);
  if (draft.purchaseDate !== before.purchaseDate) patch.purchaseDate = draft.purchaseDate || null;
  if (draft.arrivalDate !== before.arrivalDate) patch.arrivalDate = draft.arrivalDate || null;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/** The request that changes the line: only what differs from the line as it was read. */
export function linePatch(draft: EditDraft, line: CalcLine, lookups: LineLookups): LinePatch {
  const before = editDraft(line);
  const patch: LinePatch = { version: line.version };
  if (draft.item.trim() !== before.item) patch.item = draft.item.trim();
  if (draft.category !== before.category) patch.category = draft.category || null;
  if (draft.priority !== before.priority) patch.priority = draft.priority || null;
  if (draft.car !== before.car) patch.carSeasonId = draft.car === "" ? null : Number(draft.car);
  const figures: NonNullable<LinePatch["figures"]> = {};
  for (const phase of PHASES) {
    const changed = phasePatch(draft[phase], before[phase], severalFunds(line, phase), lookups);
    if (changed) figures[phase] = changed;
  }
  if (Object.keys(figures).length > 0) patch.figures = figures;
  return patch;
}
