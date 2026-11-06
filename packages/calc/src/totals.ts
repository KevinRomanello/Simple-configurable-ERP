import { blocksOf, inBlock } from "./blocks";
import { computeLines, type CalcLine } from "./lines";
import { sumAmounts } from "./line";
import type { AreaInput, Snapshot } from "./snapshot";

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
  /** The same figures per project of the area: projects of different seasons with the same name are one. */
  projects: (TotalsFigures & { name: string })[];
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

/** The projects of some lines, in the order of the lines, the ones with the same name (any case) together. */
function byProject(lines: CalcLine[], threshold: number): TotalsRow["projects"] {
  const groups = new Map<string, CalcLine[]>();
  for (const line of lines) {
    const key = line.projectName.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return [...groups.values()].map((group) => ({ name: group[0]!.projectName, ...figuresOf(group, threshold) }));
}

/** The TOTAL sheet: for every block, one row per area plus the grand total. */
export function totals(snapshot: Snapshot): Totals {
  return totalsOfLines(computeLines(snapshot), snapshot.areas, blocksOf(snapshot), snapshot.lookups.settings.varianceThreshold);
}

/**
 * TOTAL for any set of lines: one season, the phases of a calendar year, the lines of a car (they
 * can come from several seasons). For every block, one row per area with its projects, and the total.
 */
export function totalsOfLines(lines: CalcLine[], areas: AreaInput[], blockNames: string[], threshold: number): Totals {
  const blocks = blockNames.map((block) => {
    const inThisBlock = lines.filter((l) => inBlock(l, block));
    const rows = areas.map((area) => {
      const ofArea = inThisBlock.filter((l) => l.areaId === area.id);
      return { areaCode: area.code, areaName: area.name, ...figuresOf(ofArea, threshold), projects: byProject(ofArea, threshold) };
    });
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
