import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Totals } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { blockTitle } from "../lib/blocks";
import { money, ratio } from "../lib/format";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

type Figures = Totals["blocks"][number]["rows"][number];

const SORT: SortAccessors<Figures> = {
  area: (r) => r.areaName,
  estGross: (r) => r.estimateGrossCents,
  estOutflow: (r) => r.estimateOutflowCents,
  actGross: (r) => r.actualGrossCents,
  actOutflow: (r) => r.actualOutflowCents,
  variance: (r) => r.outflowVariance ?? null,
};

/** TOTAL: estimate against actual, per area, for all items and for each category. */
export function TotalPage() {
  const totals = useQuery({ queryKey: ["totals"], queryFn: api.totals });
  const [blockName, setBlockName] = useState("ALL");
  const sort = useSort(SORT);
  if (!totals.data) return <p className="empty">Loading…</p>;

  const block = totals.data.blocks.find((b) => b.block === blockName) ?? totals.data.blocks[0]!;
  const threshold = ratio(totals.data.threshold);

  const row = (label: string, f: Figures | Totals["blocks"][number]["total"], isTotal: boolean) => {
    const outflowClass = isTotal && "outflowStatus" in f ? (f.outflowStatus === "within" ? "cell-positive" : "cell-negative") : "";
    return (
      <tr key={label} className={isTotal ? "total" : ""}>
        <td className="bold">{label}</td>
        <td className="num">{money(f.estimateGrossCents)}</td>
        <td className={`num ${outflowClass}`}>{money(f.estimateOutflowCents)}</td>
        <td className="num">{money(f.actualGrossCents)}</td>
        <td className={`num ${outflowClass}`}>{money(f.actualOutflowCents)}</td>
        <td className={`num sum ${f.outflowOutOfRange ? "cell-negative" : ""}`}>{ratio(f.outflowVariance)}</td>
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
        <DownloadMenu />
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
        <TableBox title={`Totals (${blockTitle(block.block)})`}>
          <table className="data-table">
            <thead>
              <tr>
                <SortTh sort={sort} by="area">AREA</SortTh>
                <SortTh sort={sort} by="estGross" className="num">ESTIMATED GRAND TOTAL COST</SortTh>
                <SortTh sort={sort} by="estOutflow" className="num">EXPECTED OUTFLOW</SortTh>
                <SortTh sort={sort} by="actGross" className="num">ACTUAL GRAND TOTAL COST</SortTh>
                <SortTh sort={sort} by="actOutflow" className="num">ACTUAL OUTFLOW</SortTh>
                <SortTh sort={sort} by="variance" className="num sum">OUTFLOW VARIANCE</SortTh>
              </tr>
            </thead>
            <tbody>
              {sort.sorted(block.rows).map((r) => row(r.areaName, r, false))}
              {row("TOTAL", block.total, true)}
            </tbody>
          </table>
        </TableBox>
      </section>
    </>
  );
}
