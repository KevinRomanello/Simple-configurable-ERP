import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Analysis } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { DataTable, Loading, PageHeader, Panel, type Column } from "../components/ui";
import { blockTitle } from "../lib/blocks";
import { money } from "../lib/format";

type Kind = "funds" | "suppliers";

const COPY: Record<Kind, { title: string; entity: string; hint: string }> = {
  funds: {
    title: "CASH FROM ANALYSES",
    entity: "Cash source",
    hint: "Spending per fund, VAT included: a sponsor's fund covers the VAT of what it pays.",
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
type Figures = NonNullable<Line["row"]["estimate"]>;

// Spending is shown red as soon as it exists, like the old sheet did.
const red = (figures: Figures | null) => (figures && figures.outflowCents > 0 ? "cell-negative" : undefined);

/** The three columns of one phase: the name, its grand total cost and its outflow. */
function phaseColumns(phase: "estimate" | "actual", title: string): Column<Line>[] {
  return [
    { key: `${phase}Name`, header: title, sort: (l) => l.names[phase], cellClass: () => "bold", cell: (l) => l.names[phase] ?? "" },
    {
      key: `${phase}Gross`,
      header: "GRAND TOTAL COST",
      num: true,
      sort: (l) => l.row[phase]?.grossCents ?? null,
      cell: (l) => (l.row[phase] ? money(l.row[phase]!.grossCents) : ""),
    },
    {
      key: `${phase}Outflow`,
      header: "OUTFLOW",
      num: true,
      sort: (l) => l.row[phase]?.outflowCents ?? null,
      cellClass: (l) => red(l.row[phase]),
      cell: (l) => (l.row[phase] ? money(l.row[phase]!.outflowCents) : ""),
    },
  ];
}

/** CASH FROM ANALYSES and BOUGHT FROM ANALYSES: estimate against actual for each name. */
export function AnalysisPage({ kind }: { kind: Kind }) {
  const analysis = useQuery({
    queryKey: ["analysis", kind],
    queryFn: kind === "funds" ? api.fundAnalysis : api.supplierAnalysis,
  });
  const [blockName, setBlockName] = useState("ALL");
  const copy = COPY[kind];
  if (!analysis.data) return <Loading />;

  const data: Analysis = analysis.data;
  const block = data.blocks.find((b) => b.block === blockName) ?? data.blocks[0]!;
  const lines: Line[] = data.names.map((names, i) => ({ names, row: block.rows[i]! }));
  const chartRows = data.names.map((names, i) => ({
    name: names.estimate ?? names.actual ?? "",
    estOutflow: block.rows[i]?.estimate?.outflowCents ?? 0,
    actGross: block.rows[i]?.actual?.grossCents ?? 0,
    actOutflow: block.rows[i]?.actual?.outflowCents ?? 0,
  }));
  const columns = [
    ...phaseColumns("estimate", `ESTIMATED ${copy.entity.toUpperCase()}`),
    ...phaseColumns("actual", `ACTUAL ${copy.entity.toUpperCase()}`),
  ];

  return (
    <>
      <PageHeader title={copy.title} description={copy.hint} />
      <Panel>
        <Chips
          label="Block"
          value={block.block}
          onChange={setBlockName}
          options={data.blocks.map((b) => ({ value: b.block, label: blockTitle(b.block) }))}
        />
        <h2>{blockTitle(block.block)}</h2>
        <DataTable
          title={`${copy.title} (${blockTitle(block.block)})`}
          columns={columns}
          rows={lines}
          rowKey={(l) => `${l.names.estimate}-${l.names.actual}`}
          footer={
            <tr className="total">
              <td>TOTAL</td>
              <td className="num">{money(block.total.estimate.grossCents)}</td>
              <td className="num">{money(block.total.estimate.outflowCents)}</td>
              <td>TOTAL</td>
              <td className="num">{money(block.total.actual.grossCents)}</td>
              <td className="num">{money(block.total.actual.outflowCents)}</td>
            </tr>
          }
        />
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
      </Panel>
    </>
  );
}
