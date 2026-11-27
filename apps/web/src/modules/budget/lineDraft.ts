import type { FiguresPatch } from "./api";
import type { Fund } from "./types";
import type { Phase } from "../../core/calcTypes";

// What the form of a new budget line collects, and how it becomes the body of the request: only what
// was filled in, and only for the phases chosen.

/** What a phase of the form asks. Everything is text, as typed. */
export interface PhaseDraft {
  quantity: string;
  /** The price of one unit, as typed: without VAT or with it, as `priceMode` says. */
  unitCost: string;
  priceMode: "net" | "gross";
  /** The price the other way, kept to swap to when the person changes `priceMode` (worked out from the line; empty for a new one). */
  otherCost: string;
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
  /** The make and the model of what is bought: free text, both optional. */
  brand: string;
  model: string;
  category: string;
  priority: string;
  /** The season whose car the line is for, as its id; "" = the car of the line's own season. */
  car: string;
  fillIn: FillIn;
  /** ACTUAL same as EXPECTED (only with "EXPECTED and ACTUAL"): one block of boxes, written in both phases. Not kept on the line. */
  sameActual: boolean;
  estimate: PhaseDraft;
  actual: PhaseDraft;
}

export const EMPTY_PHASE: PhaseDraft = { quantity: "", unitCost: "", priceMode: "net", otherCost: "", fund: "", supplier: "", vatRate: "", purchaseDate: "", arrivalDate: "" };

/** A new line as the form starts: the purchase date is today (the arrival date is left empty: it is not known yet). */
export function newLineDraft(today: string): LineDraft {
  const phase = { ...EMPTY_PHASE, purchaseDate: today };
  return { item: "", brand: "", model: "", category: "", priority: "", car: "", fillIn: "estimate", sameActual: false, estimate: phase, actual: phase };
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
  if (draft.unitCost !== "") figures[draft.priceMode === "gross" ? "unitGrossCost" : "unitNetCost"] = Number(draft.unitCost);
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

/** The funds that can pay in EXPECTED and in ACTUAL both (by id): all a line written in both phases at once may choose from. */
export function fundsOfBoth(lookups: { funds: Record<Phase, Fund[]> }): Fund[] {
  const inActual = new Set(lookups.funds.actual.map((f) => f.id));
  return lookups.funds.estimate.filter((f) => inActual.has(f.id));
}

/** Whether the tick counts: only when both phases are filled in. */
export const isSameActual = (draft: LineDraft) => draft.fillIn === "both" && draft.sameActual;

/**
 * The form with the tick put on or taken off. Taking it off gives ACTUAL a copy of what was written for both, so nothing
 * is lost and only what differs is corrected (the arrival date is EXPECTED's alone). Putting it on drops a fund that cannot
 * pay in both phases, because the list no longer offers it.
 */
export function withSameActual(draft: LineDraft, on: boolean, fundsOfBothNames: string[]): LineDraft {
  if (!on) return { ...draft, sameActual: false, actual: { ...draft.estimate, arrivalDate: "" } };
  const allowed = new Set(fundsOfBothNames.map((name) => name.toLowerCase()));
  const fund = allowed.has(draft.estimate.fund.toLowerCase()) ? draft.estimate.fund : "";
  return { ...draft, sameActual: true, estimate: { ...draft.estimate, fund } };
}

export interface NewLineBody {
  item: string;
  brand?: string;
  model?: string;
  category?: string;
  priority?: string;
  carSeasonId?: number;
  figures?: Partial<Record<Phase, FiguresPatch>>;
}

/**
 * The request that adds the line: the phases that were not chosen are left out even if something was
 * typed in them, and a chosen phase without a purchase date gets `today`. The arrival date may stay empty.
 * With the tick ACTUAL gets the figures of EXPECTED, without the arrival date: ACTUAL works that out from what arrives.
 */
export function lineBody(draft: LineDraft, lookups: LineLookups, today: string): NewLineBody {
  const same = isSameActual(draft);
  const figures: Partial<Record<Phase, FiguresPatch>> = {};
  for (const phase of PHASES_OF[draft.fillIn]) {
    const typed = same && phase === "actual" ? { ...draft.estimate, arrivalDate: "" } : draft[phase];
    const filled = phaseFigures({ ...typed, purchaseDate: typed.purchaseDate || today }, lookups);
    if (filled) figures[phase] = filled;
  }
  return {
    item: draft.item.trim(),
    ...(draft.brand.trim() !== "" ? { brand: draft.brand.trim() } : {}),
    ...(draft.model.trim() !== "" ? { model: draft.model.trim() } : {}),
    ...(draft.category !== "" ? { category: draft.category } : {}),
    ...(draft.priority !== "" ? { priority: draft.priority } : {}),
    ...(draft.car !== "" ? { carSeasonId: Number(draft.car) } : {}),
    ...(Object.keys(figures).length > 0 ? { figures } : {}),
  };
}
