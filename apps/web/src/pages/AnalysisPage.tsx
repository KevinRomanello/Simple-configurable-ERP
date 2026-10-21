import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Analysis } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { blockTitle } from "../lib/blocks";
import { money } from "../lib/format";

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

/** CASH FROM ANALYSES and BOUGHT FROM ANALYSES: estimate against actual for each name. */
export function AnalysisPage({ kind }: { kind: Kind }) {
  const analysis = useQuery({
    queryKey: ["analysis", kind],
    queryFn: kind === "funds" ? api.fundAnalysis : api.supplierAnalysis,
  });
  const [blockName, setBlockName] = useState("ALL");
  const copy = COPY[kind];
  if (!analysis.data) return <p className="empty">Loading…</p>;

  const data: Analysis = analysis.data;
  const block = data.blocks.find((b) => b.block === blockName) ?? data.blocks[0]!;
  const chartRows = data.names.map((names, i) => ({
    name: names.estimate ?? names.actual ?? "",
    estOutflow: block.rows[i]?.estimate?.outflowCents ?? 0,
    actGross: block.rows[i]?.actual?.grossCents ?? 0,
    actSponsor: block.rows[i]?.actual?.sponsorCents ?? 0,
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
            title={`Actual Cost, Sponsor & Outflow Breakdown (${block.block === "ALL" ? "All Items" : block.block})`}
            data={chartRows}
            xKey="name"
            series={[
              { key: "actGross", label: "Actual Grand Total Cost" },
              { key: "actSponsor", label: "Actual Sponsored Value" },
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
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ESTIMATED {copy.entity.toUpperCase()}</th>
                <th className="num">GRAND TOTAL COST</th>
                <th className="num">SPONSORED VALUE</th>
                <th className="num">OUTFLOW</th>
                <th>ACTUAL {copy.entity.toUpperCase()}</th>
                <th className="num">GRAND TOTAL COST</th>
                <th className="num">SPONSORED VALUE</th>
                <th className="num">OUTFLOW</th>
              </tr>
            </thead>
            <tbody>
              {data.names.map((names, i) => {
                const row = block.rows[i]!;
                return (
                  <tr key={`${names.estimate}-${names.actual}`}>
                    <td className="bold">{names.estimate ?? ""}</td>
                    <td className="num">{row.estimate ? money(row.estimate.grossCents) : ""}</td>
                    <td className="num">{row.estimate ? money(row.estimate.sponsorCents) : ""}</td>
                    <td className={`num ${row.estimate ? outflowClass(row.estimate.outflowCents) : ""}`}>{row.estimate ? money(row.estimate.outflowCents) : ""}</td>
                    <td className="bold">{names.actual ?? ""}</td>
                    <td className="num">{row.actual ? money(row.actual.grossCents) : ""}</td>
                    <td className="num">{row.actual ? money(row.actual.sponsorCents) : ""}</td>
                    <td className={`num ${row.actual ? outflowClass(row.actual.outflowCents) : ""}`}>{row.actual ? money(row.actual.outflowCents) : ""}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>TOTAL</td>
                <td className="num">{money(block.total.estimate.grossCents)}</td>
                <td className="num">{money(block.total.estimate.sponsorCents)}</td>
                <td className="num">{money(block.total.estimate.outflowCents)}</td>
                <td>TOTAL</td>
                <td className="num">{money(block.total.actual.grossCents)}</td>
                <td className="num">{money(block.total.actual.sponsorCents)}</td>
                <td className="num">{money(block.total.actual.outflowCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
