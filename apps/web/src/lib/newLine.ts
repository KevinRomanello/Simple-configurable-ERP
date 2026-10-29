import type { FiguresPatch } from "../api/client";
import type { Phase } from "../api/types";

// What the form of a new budget line collects, and how it becomes the body of the request: only what
// was filled in, and only for the phases chosen.

/** What a phase of the form asks. Everything is text, as typed. */
export interface PhaseDraft {
  quantity: string;
  unitCost: string;
  /** The name of the fund (CASH FROM), as the list shows it. */
  fund: string;
  /** The name of the supplier (BOUGHT FROM). */
  supplier: string;
  vatRate: string;
  purchaseDate: string;
  arrivalDate: string;
}

/** Which of the two phases the person fills in. */
export type FillIn = "estimate" | "actual" | "both";

export const PHASES_OF: Record<FillIn, readonly Phase[]> = {
  estimate: ["estimate"],
  actual: ["actual"],
  both: ["estimate", "actual"],
};

export interface LineDraft {
  item: string;
  category: string;
  priority: string;
  fillIn: FillIn;
  estimate: PhaseDraft;
  actual: PhaseDraft;
}

export const EMPTY_PHASE: PhaseDraft = { quantity: "", unitCost: "", fund: "", supplier: "", vatRate: "", purchaseDate: "", arrivalDate: "" };

/** A new line as the form starts: the purchase date is today (the arrival date is left empty: it is not known yet). */
export function newLineDraft(today: string): LineDraft {
  const phase = { ...EMPTY_PHASE, purchaseDate: today };
  return { item: "", category: "", priority: "", fillIn: "estimate", estimate: phase, actual: phase };
}

/** What the form needs to know about the funds and the suppliers (names are compared in lower case). */
export interface LineLookups {
  fundByName: Map<string, { id: number; kind: "team" | "external" }>;
  supplierIdByName: Map<string, number>;
}

/** Whether the VAT rate is typed on the line: only when the team's fund pays, or nobody does yet. */
export function choosesOwnRate(fundName: string, lookups: LineLookups): boolean {
  return fundName === "" || lookups.fundByName.get(fundName.toLowerCase())?.kind === "team";
}

/** The figures of one phase: what was filled in, nothing for what was left empty. */
export function phaseFigures(draft: PhaseDraft, lookups: LineLookups): FiguresPatch | undefined {
  const figures: FiguresPatch = {};
  if (draft.quantity !== "") figures.quantity = Number(draft.quantity);
  if (draft.unitCost !== "") figures.unitNetCost = Number(draft.unitCost);
  const fund = lookups.fundByName.get(draft.fund.toLowerCase());
  if (fund) figures.fundIds = [fund.id];
  // a goods sponsor chosen as the fund and no supplier: the server makes it the supplier too
  const supplierId = lookups.supplierIdByName.get(draft.supplier.toLowerCase());
  if (supplierId !== undefined) figures.supplierId = supplierId;
  if (draft.vatRate !== "" && choosesOwnRate(draft.fund, lookups)) figures.vatRate = Number(draft.vatRate);
  if (draft.purchaseDate !== "") figures.purchaseDate = draft.purchaseDate;
  if (draft.arrivalDate !== "") figures.arrivalDate = draft.arrivalDate;
  return Object.keys(figures).length > 0 ? figures : undefined;
}

export interface NewLineBody {
  item: string;
  category?: string;
  priority?: string;
  figures?: Partial<Record<Phase, FiguresPatch>>;
}

/**
 * The request that adds the line: the phases that were not chosen are left out even if something was
 * typed in them, and a chosen phase without a purchase date gets `today`. The arrival date may stay empty.
 */
export function lineBody(draft: LineDraft, lookups: LineLookups, today: string): NewLineBody {
  const figures: Partial<Record<Phase, FiguresPatch>> = {};
  for (const phase of PHASES_OF[draft.fillIn]) {
    const filled = phaseFigures({ ...draft[phase], purchaseDate: draft[phase].purchaseDate || today }, lookups);
    if (filled) figures[phase] = filled;
  }
  return {
    item: draft.item.trim(),
    ...(draft.category !== "" ? { category: draft.category } : {}),
    ...(draft.priority !== "" ? { priority: draft.priority } : {}),
    ...(Object.keys(figures).length > 0 ? { figures } : {}),
  };
}
