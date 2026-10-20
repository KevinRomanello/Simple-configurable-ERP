import { blocksOf, inBlock } from "./blocks";
import { computeLines, type CalcLine } from "./lines";
import { sumAmounts } from "./line";
import type { Snapshot } from "./snapshot";

export interface TotalsFigures {
  estimateGrossCents: number;
  estimateSponsorCents: number;
  estimateOutflowCents: number;
  actualGrossCents: number;
  actualSponsorCents: number;
  actualOutflowCents: number;
  /** (actual - estimate) / estimate; null when the estimate is zero. */
  outflowVariance: number | null;
  sponsorVariance: number | null;
  /** Variance beyond the configured threshold, in either direction. */
  outflowOutOfRange: boolean;
  sponsorOutOfRange: boolean;
}

export interface TotalsRow extends TotalsFigures {
  areaCode: string;
  areaName: string;
}

export interface TotalsBlock {
  block: string;
  rows: TotalsRow[];
  total: TotalsFigures & {
    /** Green when the actual outflow stayed within the estimate, red when it exceeded it. */
    outflowStatus: "within" | "over";
  };
}

export interface Totals {
  threshold: number;
  blocks: TotalsBlock[];
}

function variance(actual: number, estimate: number): number | null {
  return estimate === 0 ? null : (actual - estimate) / estimate;
}

function figuresOf(lines: CalcLine[], threshold: number): TotalsFigures {
  const estimate = sumAmounts(lines.map((l) => l.estimate.amounts));
  const actual = sumAmounts(lines.map((l) => l.actual.amounts));
  const outflowVariance = variance(actual.outflowCents, estimate.outflowCents);
  const sponsorVariance = variance(actual.sponsorCents, estimate.sponsorCents);
  const outside = (v: number | null) => v !== null && Math.abs(v) > threshold;
  return {
    estimateGrossCents: estimate.grossCents,
    estimateSponsorCents: estimate.sponsorCents,
    estimateOutflowCents: estimate.outflowCents,
    actualGrossCents: actual.grossCents,
    actualSponsorCents: actual.sponsorCents,
    actualOutflowCents: actual.outflowCents,
    outflowVariance,
    sponsorVariance,
    outflowOutOfRange: outside(outflowVariance),
    sponsorOutOfRange: outside(sponsorVariance),
  };
}

/** The TOTAL sheet: for every block, one row per area plus the grand total. */
export function totals(snapshot: Snapshot): Totals {
  const threshold = snapshot.lookups.settings.varianceThreshold;
  const lines = computeLines(snapshot);

  const blocks = blocksOf(snapshot).map((block) => {
    const inThisBlock = lines.filter((l) => inBlock(l, block));
    const rows = snapshot.areas.map((area) => ({
      areaCode: area.code,
      areaName: area.name,
      ...figuresOf(
        inThisBlock.filter((l) => l.areaId === area.id),
        threshold,
      ),
    }));
    const total = figuresOf(inThisBlock, threshold);
    return {
      block,
      rows,
      total: {
        ...total,
        outflowStatus: total.actualOutflowCents <= total.estimateOutflowCents ? "within" : "over",
      } as TotalsBlock["total"],
    };
  });

  return { threshold, blocks };
}
