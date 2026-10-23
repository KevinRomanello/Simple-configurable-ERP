import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Analysis } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { blockTitle } from "../lib/blocks";
import { money } from "../lib/format";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

type Kind = "funds" | "suppliers";

const COPY: Record<Kind, { title: string; entity: string; hint: string }> = {
  funds: {
    title: "CASH FROM ANALYSES",
    entity: "Cash source",
    hint: "Spending per fund. The VAT of a fund that does not pay it is left out of its outflow: it is the team's.",
  },
  suppliers: {
    title: "BOUGHT FROM ANALYSES",
    entity: "Supplier",
    hint: "Spending per supplier, among the suppliers used in each phase.",
  },
};

/** One line of the table: the estimated and the actual figures of a name, side by side. */
interface Line {
  names: Analysis["names"][number];
  row: Analysis["blocks"][number]["rows"][number];
}

const SORT: SortAccessors<Line> = {
  estName: (l) => l.names.estimate,
  estGross: (l) => l.row.estimate?.grossCents ?? null,
  estOutflow: (l) => l.row.estimate?.outflowCents ?? null,
  actName: (l) => l.names.actual,
  actGross: (l) => l.row.actual?.grossCents ?? null,
  actOutflow: (l) => l.row.actual?.outflowCents ?? null,
};

/** CASH FROM ANALYSES and BOUGHT FROM ANALYSES: estimate against actual for each name. */
export function AnalysisPage({ kind }: { kind: Kind }) {
  const analysis = useQuery({
    queryKey: ["analysis", kind],
    queryFn: kind === "funds" ? api.fundAnalysis : api.supplierAnalysis,
  });
  const [blockName, setBlockName] = useState("ALL");
  const copy = COPY[kind];
  const sort = useSort(SORT);
  if (!analysis.data) return <p className="empty">Loading…</p>;

  const data: Analysis = analysis.data;
  const block = data.blocks.find((b) => b.block === blockName) ?? data.blocks[0]!;
  const chartRows = data.names.map((names, i) => ({
    name: names.estimate ?? names.actual ?? "",
    estOutflow: block.rows[i]?.estimate?.outflowCents ?? 0,
    actGross: block.rows[i]?.actual?.grossCents ?? 0,
    actOutflow: block.rows[i]?.actual?.outflowCents ?? 0,
  }));
  // Spending is shown red as soon as it exists, like the old sheet did.
  const outflowClass = (cents: number) => (cents > 0 ? "cell-negative" : "");

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{copy.title}</h1>
          <p className="muted">{copy.hint}</p>
        </div>
        <DownloadMenu />
      </header>
      <section className="panel">
        <Chips
          label="Block"
          value={block.block}
          onChange={setBlockName}
          options={data.blocks.map((b) => ({ value: b.block, label: blockTitle(b.block) }))}
        />
        <h2>{blockTitle(block.block)}</h2>
        <div className="charts">
          <BarsChart
            title={`Actual Cost & Outflow Breakdown (${block.block === "ALL" ? "All Items" : block.block})`}
            data={chartRows}
            xKey="name"
            series={[
              { key: "actGross", label: "Actual Grand Total Cost" },
              { key: "actOutflow", label: "Actual Outflow" },
            ]}
          />
          <BarsChart
            title={`Outflow Comparison: Expected vs Actual (${block.block === "ALL" ? "All Items" : block.block})`}
            data={chartRows}
            xKey="name"
            series={[
              { key: "estOutflow", label: "Expected Outflow" },
              { key: "actOutflow", label: "Actual Outflow" },
            ]}
          />
        </div>
        <TableBox title={`${copy.title} (${blockTitle(block.block)})`}>
          <table className="data-table">
            <thead>
              <tr>
                <SortTh sort={sort} by="estName">{`ESTIMATED ${copy.entity.toUpperCase()}`}</SortTh>
                <SortTh sort={sort} by="estGross" className="num">GRAND TOTAL COST</SortTh>
                <SortTh sort={sort} by="estOutflow" className="num">OUTFLOW</SortTh>
                <SortTh sort={sort} by="actName">{`ACTUAL ${copy.entity.toUpperCase()}`}</SortTh>
                <SortTh sort={sort} by="actGross" className="num">GRAND TOTAL COST</SortTh>
                <SortTh sort={sort} by="actOutflow" className="num">OUTFLOW</SortTh>
              </tr>
            </thead>
            <tbody>
              {sort.sorted(data.names.map((names, i) => ({ names, row: block.rows[i]! }))).map(({ names, row }) => {
                return (
                  <tr key={`${names.estimate}-${names.actual}`}>
                    <td className="bold">{names.estimate ?? ""}</td>
                    <td className="num">{row.estimate ? money(row.estimate.grossCents) : ""}</td>
                    <td className={`num ${row.estimate ? outflowClass(row.estimate.outflowCents) : ""}`}>{row.estimate ? money(row.estimate.outflowCents) : ""}</td>
                    <td className="bold">{names.actual ?? ""}</td>
                    <td className="num">{row.actual ? money(row.actual.grossCents) : ""}</td>
                    <td className={`num ${row.actual ? outflowClass(row.actual.outflowCents) : ""}`}>{row.actual ? money(row.actual.outflowCents) : ""}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>TOTAL</td>
                <td className="num">{money(block.total.estimate.grossCents)}</td>
                <td className="num">{money(block.total.estimate.outflowCents)}</td>
                <td>TOTAL</td>
                <td className="num">{money(block.total.actual.grossCents)}</td>
                <td className="num">{money(block.total.actual.outflowCents)}</td>
              </tr>
            </tbody>
          </table>
        </TableBox>
      </section>
    </>
  );
}
