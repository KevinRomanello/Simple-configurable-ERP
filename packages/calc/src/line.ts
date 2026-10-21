import { netCents, percentOf } from "./money";
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
