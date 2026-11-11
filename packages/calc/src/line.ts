import { grossCents, netCents, netOfGross, percentOf } from "./money";
import type { Figures } from "./snapshot";
import type { Settings, SponsorType } from "./types";

/** The five amounts of a line in one phase, in cents. */
export interface Amounts {
  netCents: number;
  vatCents: number;
  grossCents: number;
  sponsorCents: number;
  outflowCents: number;
}

export interface LineAmounts extends Amounts {
  /** False while the sponsor type or the VAT rate is still to be chosen. */
  complete: boolean;
}

export const ZERO_AMOUNTS: Amounts = {
  netCents: 0,
  vatCents: 0,
  grossCents: 0,
  sponsorCents: 0,
  outflowCents: 0,
};

export function addAmounts(a: Amounts, b: Amounts): Amounts {
  return {
    netCents: a.netCents + b.netCents,
    vatCents: a.vatCents + b.vatCents,
    grossCents: a.grossCents + b.grossCents,
    sponsorCents: a.sponsorCents + b.sponsorCents,
    outflowCents: a.outflowCents + b.outflowCents,
  };
}

export function sumAmounts(list: Iterable<Amounts>): Amounts {
  let total = ZERO_AMOUNTS;
  for (const amounts of list) total = addAmounts(total, amounts);
  return total;
}

/**
 * The money of one line in one phase (rules: docs/regole-script-attuale.md, section 3).
 *
 *   net     = quantity x unit cost
 *   sponsor = none: 0, partial: the typed value, total: the whole net
 *   vat     = rate applied to the net (or to net minus sponsor when the sponsor is partial)
 *   gross   = net + vat
 *   outflow = gross - sponsor
 *
 * A line whose sponsor type or VAT rate is not chosen yet has no VAT and is flagged incomplete.
 * This is the single-rate formula; a line paid by several funds splits the VAT base between them
 * (settle.ts) and uses `sponsorSplit` for the same sponsor rules.
 */
export function lineAmounts(figures: Figures | null, settings: Settings): LineAmounts {
  if (!figures) return { ...ZERO_AMOUNTS, complete: true };
  if (figures.unitGrossE4 != null) return grossLineAmounts(figures, settings);

  const net = netCents(figures.quantityMilli, figures.unitCostE4);
  const { sponsorType, vatRate } = figures;
  const { sponsor, vatBase } = sponsorSplit(sponsorType, figures.sponsorValueCents, net, settings);

  const vat = sponsorType !== null && vatRate !== null ? percentOf(vatBase, vatRate) : 0;
  const gross = net + vat;
  return {
    netCents: net,
    vatCents: vat,
    grossCents: gross,
    sponsorCents: sponsor,
    outflowCents: gross - sponsor,
    complete: sponsorType !== null && vatRate !== null,
  };
}

/**
 * `lineAmounts` for a price typed with the VAT in it: the gross is what was typed and never moves, the net
 * is what is left when the VAT at the line's rate is taken out, and the VAT is the difference, so the
 * cents always add up to what was typed. Without a rate or a sponsor type there is no VAT yet: the typed
 * price counts as the net and the line is flagged incomplete.
 */
function grossLineAmounts(figures: Figures, settings: Settings): LineAmounts {
  const gross = grossCents(figures.quantityMilli, figures.unitGrossE4!);
  const { sponsorType, vatRate } = figures;
  if (sponsorType === null || vatRate === null) {
    return { netCents: gross, vatCents: 0, grossCents: gross, sponsorCents: 0, outflowCents: gross, complete: false };
  }
  const { net, vat } = splitGross(gross, vatRate, sponsorType, settings);
  const sponsor = sponsorType === "total" ? net : sponsorType === "partial" ? (figures.sponsorValueCents ?? 0) : 0;
  return { netCents: net, vatCents: vat, grossCents: gross, sponsorCents: sponsor, outflowCents: gross - sponsor, complete: true };
}

/**
 * The net and the VAT of a price typed with the VAT in it. When a sponsor covers the whole line and the
 * VAT is taken on what the sponsor does not cover (open question Q1), nothing is left to tax.
 */
export function splitGross(gross: number, rate: number, sponsorType: SponsorType | null, settings: Settings): { net: number; vat: number } {
  if (sponsorType === "total" && settings.vatBaseWhenTotalSponsor === "net-minus-sponsor") return { net: gross, vat: 0 };
  const net = netOfGross(gross, rate);
  return { net, vat: gross - net };
}

/** What the sponsor covers of a net cost, and the amount the VAT rate is applied to. */
export function sponsorSplit(
  sponsorType: SponsorType | null,
  sponsorValueCents: number | null,
  net: number,
  settings: Settings,
): { sponsor: number; vatBase: number } {
  let sponsor = 0;
  if (sponsorType === "total") sponsor = net;
  else if (sponsorType === "partial") sponsor = sponsorValueCents ?? 0;

  if (sponsorType === "partial") return { sponsor, vatBase: net - sponsor };
  if (sponsorType === "total" && settings.vatBaseWhenTotalSponsor === "net-minus-sponsor") {
    return { sponsor, vatBase: net - sponsor }; // open question Q1: VAT on what the sponsor does not cover (zero)
  }
  return { sponsor, vatBase: net }; // the old script: VAT on the whole net
}
