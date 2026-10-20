import { netCents, percentOf } from "./money";
import type { Figures } from "./snapshot";
import type { Settings } from "./types";

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
 */
export function lineAmounts(figures: Figures | null, settings: Settings): LineAmounts {
  if (!figures) return { ...ZERO_AMOUNTS, complete: true };

  const net = netCents(figures.quantityMilli, figures.unitCostE4);
  const { sponsorType, vatRate } = figures;

  let sponsor = 0;
  if (sponsorType === "total") sponsor = net;
  else if (sponsorType === "partial") sponsor = figures.sponsorValueCents ?? 0;

  let vat = 0;
  if (sponsorType !== null && vatRate !== null) {
    vat = percentOf(vatBase(sponsorType, net, sponsor, settings), vatRate);
  }

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

/** The amount the VAT rate is applied to. */
function vatBase(
  sponsorType: "none" | "partial" | "total",
  net: number,
  sponsor: number,
  settings: Settings,
): number {
  if (sponsorType === "partial") return net - sponsor;
  if (sponsorType === "total" && settings.vatBaseWhenTotalSponsor === "net-minus-sponsor") {
    return net - sponsor; // open question Q1: VAT on what the sponsor does not cover (zero)
  }
  return net; // the old script: VAT on the whole net
}
