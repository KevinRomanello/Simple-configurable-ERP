import { lineAmounts, sponsorSplit, ZERO_AMOUNTS, type LineAmounts } from "./line";
import { netCents, percentOf } from "./money";
import type { Figures, FundInput } from "./snapshot";
import type { Settings } from "./types";

// The "black box" of the sponsors: the person chooses which fund(s) pay a line, and everything
// else (what the sponsor covers, which VAT rate, who pays the VAT, what is drawn from each fund)
// follows from how those funds are defined. Rules: docs/sponsor-e-fondi.md.

/** The part of a line that one fund pays. */
export interface FundShare {
  fundId: number;
  fundName: string;
  /** The net cost this fund pays, in cents. */
  netCents: number;
  /** The VAT on that part, in cents. */
  vatCents: number;
  /** True when the team, not the fund, pays that VAT (always for the team fund and for gifts). */
  teamPaysVat: boolean;
  /** What leaves the fund's balance: the net part, plus its VAT when the fund covers VAT. */
  drawnCents: number;
  /** What the fund could not cover (only the last fund of a line can run short). */
  shortCents: number;
}

export interface Settlement {
  amounts: LineAmounts;
  shares: FundShare[];
  /** The VAT the team pays out of its own cash for this line. */
  teamVatCents: number;
  /** The net purchases paid from the team fund (VAT excluded: it leaves on its deadline). */
  teamFundCents: number;
}

/** What is left of each external fund while the lines of a phase are settled one after the other. */
export type FundBalances = Map<number, number>;

const isGift = (fund: FundInput) => fund.kind === "external" && fund.type !== "fund";

/** The VAT rate of a gift: none for a plain gift, the counter-invoice rate otherwise. */
const giftRate = (fund: FundInput) => (fund.type === "gift" ? 0 : (fund.vatRate ?? 0));

/** The largest net amount whose gross (net + VAT at `rate` percent) fits in `free` cents. */
function netThatFits(free: number, rate: number): number {
  if (!Number.isFinite(free) || rate === 0) return free;
  return Number((BigInt(free) * 10_000n) / BigInt(10_000 + Math.round(rate * 100)));
}

/**
 * Settles one line in one phase against the funds that pay it. `balances` holds what is left of
 * each fund and is updated here, so the caller must settle the lines in the order of the sheet.
 *
 *  - no fund chosen: the single-rate formula of `lineAmounts`, from what was typed in;
 *  - a gift: the sponsor covers the whole net, the team pays the VAT on it (none for `gift`);
 *  - otherwise the net is drawn from the funds in order, each up to what it has left, and the
 *    last one takes whatever remains (it goes negative and the line is flagged as short).
 */
export function settleLine(
  figures: Figures | null,
  funds: FundInput[],
  balances: FundBalances,
  settings: Settings,
): Settlement {
  if (!figures) {
    return { amounts: { ...ZERO_AMOUNTS, complete: true }, shares: [], teamVatCents: 0, teamFundCents: 0 };
  }
  if (funds.length === 0) {
    return { amounts: lineAmounts(figures, settings), shares: [], teamVatCents: 0, teamFundCents: 0 };
  }

  const net = netCents(figures.quantityMilli, figures.unitCostE4);
  const gift = funds.find(isGift);
  return gift || figures.sponsorType === "total"
    ? settleTotal(figures, net, gift ?? funds[0]!, balances, settings)
    : settleShares(figures, net, funds, balances, settings);
}

/** A sponsor that covers the whole net: one share that carries only the VAT. */
function settleTotal(
  figures: Figures,
  net: number,
  fund: FundInput,
  balances: FundBalances,
  settings: Settings,
): Settlement {
  const team = fund.kind === "team";
  const rate = isGift(fund) ? giftRate(fund) : team ? figures.vatRate : fund.vatRate;
  const { sponsor, vatBase } = sponsorSplit("total", null, net, settings);
  const vat = rate === null ? 0 : percentOf(vatBase, rate);

  const teamPays = team || isGift(fund);
  const drawn = teamPays ? 0 : vat;
  if (drawn > 0) balances.set(fund.id, (balances.get(fund.id) ?? 0) - drawn);

  return {
    amounts: {
      netCents: net,
      vatCents: vat,
      grossCents: net + vat,
      sponsorCents: sponsor,
      outflowCents: net + vat - sponsor,
      complete: rate !== null,
    },
    shares: [
      { fundId: fund.id, fundName: fund.name, netCents: 0, vatCents: vat, teamPaysVat: teamPays, drawnCents: drawn, shortCents: 0 },
    ],
    teamVatCents: teamPays ? vat : 0,
    teamFundCents: 0,
  };
}

/** The usual case: the net is drawn from the funds in order. */
function settleShares(
  figures: Figures,
  net: number,
  funds: FundInput[],
  balances: FundBalances,
  settings: Settings,
): Settlement {
  // Without a chosen sponsor type a line paid from a fund simply has no sponsor discount.
  const { sponsor, vatBase } = sponsorSplit(figures.sponsorType ?? "none", figures.sponsorValueCents, net, settings);

  let remaining = vatBase;
  let complete = true;
  const shares = funds.map((fund, index): FundShare => {
    const team = fund.kind === "team";
    const rate = team ? figures.vatRate : fund.vatRate;
    if (rate === null) complete = false;
    const coversVat = !team; // a sponsor's fund covers the VAT at its own rate (0% = no VAT)

    const before = team ? Infinity : Math.max(0, balances.get(fund.id) ?? 0);
    const last = index === funds.length - 1;
    const part = last ? remaining : Math.min(remaining, netThatFits(before, coversVat ? (rate ?? 0) : 0));
    const vat = percentOf(part, rate ?? 0);
    const drawn = part + (coversVat ? vat : 0);
    remaining -= part;

    if (!team) balances.set(fund.id, (balances.get(fund.id) ?? 0) - drawn);
    return {
      fundId: fund.id,
      fundName: fund.name,
      netCents: part,
      vatCents: vat,
      teamPaysVat: !coversVat,
      drawnCents: drawn,
      shortCents: last && !team ? Math.max(0, drawn - before) : 0,
    };
  });

  const vat = shares.reduce((sum, s) => sum + s.vatCents, 0);
  return {
    amounts: {
      netCents: net,
      vatCents: vat,
      grossCents: net + vat,
      sponsorCents: sponsor,
      outflowCents: net + vat - sponsor,
      complete,
    },
    shares,
    teamVatCents: shares.filter((s) => s.teamPaysVat).reduce((sum, s) => sum + s.vatCents, 0),
    teamFundCents: funds.reduce((sum, fund, i) => sum + (fund.kind === "team" ? shares[i]!.netCents : 0), 0),
  };
}
