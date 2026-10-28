import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Totals } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { DataTable, Loading, PageHeader, Panel, type Column } from "../components/ui";
import { blockTitle } from "../lib/blocks";
import { money, ratio } from "../lib/format";

type Figures = Totals["blocks"][number]["rows"][number];
type Total = Totals["blocks"][number]["total"];

const COLUMNS: Column<Figures>[] = [
  { key: "area", header: "AREA", sort: (r) => r.areaName, cellClass: () => "bold", cell: (r) => r.areaName },
  { key: "estGross", header: "ESTIMATED GRAND TOTAL COST", num: true, sort: (r) => r.estimateGrossCents, cell: (r) => money(r.estimateGrossCents) },
  { key: "estOutflow", header: "EXPECTED OUTFLOW", num: true, sort: (r) => r.estimateOutflowCents, cell: (r) => money(r.estimateOutflowCents) },
  { key: "actGross", header: "ACTUAL GRAND TOTAL COST", num: true, sort: (r) => r.actualGrossCents, cell: (r) => money(r.actualGrossCents) },
  { key: "actOutflow", header: "ACTUAL OUTFLOW", num: true, sort: (r) => r.actualOutflowCents, cell: (r) => money(r.actualOutflowCents) },
  {
    key: "variance",
    header: "OUTFLOW VARIANCE",
    num: true,
    className: "sum",
    sort: (r) => r.outflowVariance ?? null,
    cellClass: (r) => (r.outflowOutOfRange ? "cell-negative" : undefined),
    cell: (r) => ratio(r.outflowVariance),
  },
];

/** The TOTAL row: its outflows are green within budget, red beyond. */
function TotalRow({ total }: { total: Total }) {
  const outflow = total.outflowStatus === "within" ? "cell-positive" : "cell-negative";
  return (
    <tr className="total">
      <td className="bold">TOTAL</td>
      <td className="num">{money(total.estimateGrossCents)}</td>
      <td className={`num ${outflow}`}>{money(total.estimateOutflowCents)}</td>
      <td className="num">{money(total.actualGrossCents)}</td>
      <td className={`num ${outflow}`}>{money(total.actualOutflowCents)}</td>
      <td className={`num sum${total.outflowOutOfRange ? " cell-negative" : ""}`}>{ratio(total.outflowVariance)}</td>
    </tr>
  );
}

/** TOTAL: estimate against actual, per area, for all items and for each category. */
export function TotalPage() {
  const totals = useQuery({ queryKey: ["totals"], queryFn: api.totals });
  const [blockName, setBlockName] = useState("ALL");
  if (!totals.data) return <Loading />;

  const block = totals.data.blocks.find((b) => b.block === blockName) ?? totals.data.blocks[0]!;

  return (
    <>
      <PageHeader title="TOTAL" description={`Variances beyond ±${ratio(totals.data.threshold)} are highlighted.`} />
      <Panel>
        <Chips
          label="Block"
          value={block.block}
          onChange={setBlockName}
          options={totals.data.blocks.map((b) => ({ value: b.block, label: blockTitle(b.block) }))}
        />
        <h2>{blockTitle(block.block)}</h2>
        <DataTable
          title={`Totals (${blockTitle(block.block)})`}
          columns={COLUMNS}
          rows={block.rows}
          rowKey={(r) => r.areaName}
          footer={<TotalRow total={block.total} />}
        />
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
      </Panel>
    </>
  );
}
