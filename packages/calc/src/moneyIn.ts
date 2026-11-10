import type { Snapshot } from "./snapshot";
import type { Phase } from "./types";

// What came in, next to what went out (SEASON TOTAL and YEAR TOTAL; a car has no money of its own).
// docs/stagioni-anni-fiscali-e-macchine.md

export interface MoneyInRow {
  kind: "bank" | "sponsor" | "inflow";
  /** The sponsor or where the inflow came from; "BANK" for the balance of the account. */
  label: string;
  /** The day of the BANK balance (null for the other rows). */
  asOf: string | null;
  estimateCents: number;
  actualCents: number;
}

export interface MoneyIn {
  rows: MoneyInRow[];
  total: Record<Phase, number>;
}

/**
 * For one season: its BANK (the same in both phases), the money of each sponsor and the inflows of
 * CASH FLOW. For a calendar year (`year`): the money of the sponsors and the inflows dated in it, of
 * every season, and no BANK (a balance on a day, not something that came in). Sponsors and sources
 * with the same name (any case) are one row. In a season, an inflow dated on or before the BANK day is
 * already in the BANK (the register's sponsorship money is), so it is not counted a second time.
 */
export function moneyIn(snapshots: Snapshot[], year?: string): MoneyIn {
  const rows = new Map<string, MoneyInRow>();
  const add = (kind: MoneyInRow["kind"], label: string, phase: Phase, cents: number, date: string | null) => {
    if (year !== undefined && date?.slice(0, 4) !== year) return;
    const key = `${kind}:${label.toLowerCase()}`;
    const row = rows.get(key) ?? { kind, label, asOf: null, estimateCents: 0, actualCents: 0 };
    row[phase === "estimate" ? "estimateCents" : "actualCents"] += cents;
    rows.set(key, row);
  };

  for (const snapshot of snapshots) {
    if (snapshot.bank && year === undefined) {
      rows.set("bank", { kind: "bank", label: "BANK", asOf: snapshot.bank.asOfDate, estimateCents: snapshot.bank.amountCents, actualCents: snapshot.bank.amountCents });
    }
    const funds = new Map(snapshot.funds.map((f) => [f.id, f.name]));
    for (const c of snapshot.contracts) add("sponsor", funds.get(c.fundId) ?? `Fund ${c.fundId}`, c.phase, c.amountCents, c.inflowDate);
    const bankDay = year === undefined ? (snapshot.bank?.asOfDate ?? null) : null;
    for (const i of snapshot.inflows) {
      if (bankDay !== null && i.inflowDate !== null && i.inflowDate <= bankDay) continue;
      add("inflow", i.sourceName, i.phase, i.amountCents, i.inflowDate);
    }
  }

  const order = { bank: 0, sponsor: 1, inflow: 2 };
  const sorted = [...rows.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label));
  const total = (phase: Phase) => sorted.reduce((sum, r) => sum + (phase === "estimate" ? r.estimateCents : r.actualCents), 0);
  return { rows: sorted, total: { estimate: total("estimate"), actual: total("actual") } };
}
