import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Totals } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { blockTitle } from "../lib/blocks";
import { money, ratio } from "../lib/format";

type Figures = Totals["blocks"][number]["rows"][number];

/** TOTAL: estimate against actual, per area, for all items and for each category. */
export function TotalPage() {
  const totals = useQuery({ queryKey: ["totals"], queryFn: api.totals });
  const [blockName, setBlockName] = useState("ALL");
  if (!totals.data) return <p className="empty">Loading…</p>;

  const block = totals.data.blocks.find((b) => b.block === blockName) ?? totals.data.blocks[0]!;
  const threshold = ratio(totals.data.threshold);

  const row = (label: string, f: Figures | Totals["blocks"][number]["total"], isTotal: boolean) => {
    const outflowClass = isTotal && "outflowStatus" in f ? (f.outflowStatus === "within" ? "cell-positive" : "cell-negative") : "";
    return (
      <tr key={label} className={isTotal ? "total" : ""}>
        <td className="bold">{label}</td>
        <td className="num">{money(f.estimateGrossCents)}</td>
        <td className="num">{money(f.estimateSponsorCents)}</td>
        <td className={`num ${outflowClass}`}>{money(f.estimateOutflowCents)}</td>
        <td className="num">{money(f.actualGrossCents)}</td>
        <td className="num">{money(f.actualSponsorCents)}</td>
        <td className={`num ${outflowClass}`}>{money(f.actualOutflowCents)}</td>
        <td className={`num ${f.outflowOutOfRange ? "cell-negative" : ""}`}>{ratio(f.outflowVariance)}</td>
        <td className={`num ${f.sponsorOutOfRange ? "cell-negative" : ""}`}>{ratio(f.sponsorVariance)}</td>
      </tr>
    );
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1>TOTAL</h1>
          <p className="muted">Variances beyond ±{threshold} are highlighted.</p>
        </div>
      </header>
      <section className="panel">
        <Chips
          label="Block"
          value={block.block}
          onChange={setBlockName}
          options={totals.data.blocks.map((b) => ({ value: b.block, label: blockTitle(b.block) }))}
        />
        <h2>{blockTitle(block.block)}</h2>
        <BarsChart
          title={`Cost & Outflow Comparison (${block.block === "ALL" ? "All Items" : block.block})`}
          data={[...block.rows, { ...block.total, areaName: "TOTAL" }].map((r) => ({
            area: r.areaName,
            estGross: r.estimateGrossCents,
            actGross: r.actualGrossCents,
            estOutflow: r.estimateOutflowCents,
            actOutflow: r.actualOutflowCents,
          }))}
          xKey="area"
          series={[
            { key: "estGross", label: "Estimated grand total cost" },
            { key: "actGross", label: "Actual grand total cost" },
            { key: "estOutflow", label: "Expected outflow" },
            { key: "actOutflow", label: "Actual outflow" },
          ]}
        />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>AREA</th>
                <th className="num">ESTIMATED GRAND TOTAL COST</th>
                <th className="num">ESTIMATED SPONSORED VALUE</th>
                <th className="num">EXPECTED OUTFLOW</th>
                <th className="num">ACTUAL GRAND TOTAL COST</th>
                <th className="num">ACTUAL SPONSORED VALUE</th>
                <th className="num">ACTUAL OUTFLOW</th>
                <th className="num">OUTFLOW VARIANCE</th>
                <th className="num">SPONSORED VARIANCE</th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r) => row(r.areaName, r, false))}
              {row("TOTAL", block.total, true)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
