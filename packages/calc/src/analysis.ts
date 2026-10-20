import { blocksOf, inBlock } from "./blocks";
import { computeLines, type CalcLine, type PhaseCalc } from "./lines";
import type { Snapshot } from "./snapshot";
import type { Phase } from "./types";

export interface AnalysisCell {
  grossCents: number;
  sponsorCents: number;
  outflowCents: number;
}

export interface AnalysisBlock {
  block: string;
  /** Same order as `Analysis.names`; null when the name does not exist in that phase. */
  rows: { estimate: AnalysisCell | null; actual: AnalysisCell | null }[];
  total: { estimate: AnalysisCell; actual: AnalysisCell };
}

export interface Analysis {
  /** Names of the two phases, aligned on the same row when they match (case-insensitive). */
  names: { estimate: string | null; actual: string | null }[];
  blocks: AnalysisBlock[];
}

interface Grouping {
  /** The name a line is grouped under in this phase, or null if it has none. */
  nameOf: (phase: PhaseCalc) => string | null;
  /** Names to show even without lines (e.g. funds that only have a contract so far). */
  extraNames: (phase: Phase) => string[];
  /** The outflow of a line as this analysis counts it. */
  outflowOf: (phase: PhaseCalc, which: Phase) => number;
}

const lower = (s: string) => s.toLowerCase();

function analyse(snapshot: Snapshot, grouping: Grouping): Analysis {
  const lines = computeLines(snapshot);

  // Names per phase: those with lines plus the extra ones, without duplicates.
  const namesOf = (phase: Phase) => {
    const found = new Map<string, string>();
    for (const name of [
      ...grouping.extraNames(phase),
      ...lines.map((l) => grouping.nameOf(l[phase])).filter((n): n is string => n !== null),
    ]) {
      if (!found.has(lower(name))) found.set(lower(name), name);
    }
    return found;
  };
  const byPhase = { estimate: namesOf("estimate"), actual: namesOf("actual") };

  const keys = [...new Set([...byPhase.estimate.keys(), ...byPhase.actual.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  const names = keys.map((key) => ({
    estimate: byPhase.estimate.get(key) ?? null,
    actual: byPhase.actual.get(key) ?? null,
  }));

  const cell = (linesInBlock: CalcLine[], phase: Phase, key: string | null): AnalysisCell => {
    const matching = linesInBlock
      .map((l) => l[phase])
      .filter((p) => key === null || grouping.nameOf(p)?.toLowerCase() === key);
    return {
      grossCents: matching.reduce((sum, p) => sum + p.amounts.grossCents, 0),
      sponsorCents: matching.reduce((sum, p) => sum + p.amounts.sponsorCents, 0),
      outflowCents: matching.reduce((sum, p) => sum + grouping.outflowOf(p, phase), 0),
    };
  };

  const blocks = blocksOf(snapshot).map((block) => {
    const inThisBlock = lines.filter((l) => inBlock(l, block));
    const rows = keys.map((key, index) => ({
      estimate: names[index]!.estimate === null ? null : cell(inThisBlock, "estimate", key),
      actual: names[index]!.actual === null ? null : cell(inThisBlock, "actual", key),
    }));
    const sumOf = (phase: Phase): AnalysisCell => ({
      grossCents: rows.reduce((sum, r) => sum + (r[phase]?.grossCents ?? 0), 0),
      sponsorCents: rows.reduce((sum, r) => sum + (r[phase]?.sponsorCents ?? 0), 0),
      outflowCents: rows.reduce((sum, r) => sum + (r[phase]?.outflowCents ?? 0), 0),
    });
    return { block, rows, total: { estimate: sumOf("estimate"), actual: sumOf("actual") } };
  });

  return { names, blocks };
}

/**
 * CASH FROM ANALYSES: spending per fund. For an external fund that does not cover VAT the VAT
 * is left out of its outflow (it is the team's), exactly as in the fund balance.
 */
export function analysisByFund(snapshot: Snapshot): Analysis {
  const funds = new Map(snapshot.funds.map((f) => [f.id, f]));
  return analyse(snapshot, {
    nameOf: (p) => p.fundName,
    extraNames: (phase) =>
      snapshot.contracts
        .filter((c) => c.phase === phase)
        .map((c) => funds.get(c.fundId)?.name)
        .filter((n): n is string => n !== undefined),
    outflowOf: (p, phase) => {
      const fund = p.fundId === null ? undefined : funds.get(p.fundId);
      const vatIsTeams = fund !== undefined && fund.kind === "external" && !fund.paysVat[phase];
      return vatIsTeams ? p.amounts.outflowCents - p.amounts.vatCents : p.amounts.outflowCents;
    },
  });
}

/** BOUGHT FROM ANALYSES: spending per supplier (only suppliers actually used in a phase). */
export function analysisBySupplier(snapshot: Snapshot): Analysis {
  return analyse(snapshot, {
    nameOf: (p) => p.supplierName,
    extraNames: () => [],
    outflowOf: (p) => p.amounts.outflowCents,
  });
}
