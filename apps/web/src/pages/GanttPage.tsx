import { useQuery } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { api } from "../api/client";
import type { Gantt, Phase } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { blockTitle } from "../lib/blocks";
import { money, month } from "../lib/format";
import { TableBox } from "../components/ExportBlocks";
import { SortTh } from "../components/SortTh";
import { Loading, Message, PageHeader, Panel } from "../components/ui";
import { useSort } from "../lib/sort";

type ProjectRow = Gantt["blocks"][number]["areas"][number]["rows"][number];
type TeamFundRow = Gantt["teamFund"]["rows"][number];

/** EXPECTED GANTT / ACTUAL GANTT: outflows per area, project and month, and the team fund balance. */
export function GanttPage() {
  const { phase = "estimate" } = useParams();
  const current: Phase = phase === "actual" ? "actual" : "estimate";
  const gantt = useQuery({ queryKey: ["gantt", current], queryFn: () => api.gantt(current) });
  const [block, setBlock] = useState("ALL");

  if (!gantt.data) return <Loading />;
  const data = gantt.data;
  const selected = data.blocks.find((b) => b.block === block) ?? data.blocks[0];

  return (
    <>
      <PageHeader
        title={`${current === "estimate" ? "EXPECTED" : "ACTUAL"} GANTT`}
        description="Outflow per month. When the team pays the VAT, only the net leaves on the purchase date and the VAT leaves on its deadline."
      />

      {data.blocks.length === 0 ? (
        <Message>No purchase has a date yet.</Message>
      ) : (
        <BlockTable
          gantt={data}
          blockName={selected!.block}
          chips={
            <Chips
              label="Block"
              value={selected!.block}
              onChange={setBlock}
              options={data.blocks.map((b) => ({ value: b.block, label: blockTitle(b.block) }))}
            />
          }
        />
      )}

      <TeamFundTable gantt={data} />
    </>
  );
}

function BlockTable({ gantt, blockName, chips }: { gantt: Gantt; blockName: string; chips: ReactNode }) {
  const block = gantt.blocks.find((b) => b.block === blockName);
  const columns = gantt.months;
  // the projects of each area are sorted among themselves; the sums and the total stay where they are
  const sort = useSort<ProjectRow>({
    project: (r) => r.name,
    sum: (r) => r.sumCents,
    ...Object.fromEntries(columns.map((m) => [m, (r: ProjectRow) => r.byMonth[m] ?? 0])),
  });
  if (!block) return null;
  const cell = (byMonth: Record<string, number>, key: string) => money(byMonth[key] ?? 0, true);
  const chartData = columns.map((m) => ({
    month: month(m),
    ...Object.fromEntries(block.areas.map((area) => [area.areaName, area.monthlySum[m] ?? 0])),
  }));

  return (
    // tables by area with their sums: built from the common pieces rather than DataTable
    <Panel>
      {chips}
      <h2>{blockTitle(blockName)}</h2>
      <BarsChart
        title={`Monthly Outflow Timeline (${blockName === "ALL" ? "All Items" : blockName})`}
        data={chartData}
        xKey="month"
        series={block.areas.map((a) => ({ key: a.areaName, label: a.areaName }))}
        stacked
      />
      <TableBox title={`Monthly outflow per area (${blockTitle(blockName)})`}>
        <table className="data-table frozen">
          <thead>
            <tr>
              <SortTh sort={sort} by="project">PROJECT</SortTh>
              {columns.map((m) => <SortTh key={m} sort={sort} by={m} className="num">{month(m)}</SortTh>)}
              <SortTh sort={sort} by="sum" className="num sum sum-last">SUM PROJECT</SortTh>
            </tr>
          </thead>
          <tbody>
            {block.areas.map((area) => (
              <Fragment key={area.areaCode}>
                <tr className="group"><td colSpan={columns.length + 2}>{area.areaName}</td></tr>
                {sort.sorted(area.rows).map((row) => (
                  <tr key={`${area.areaCode}-${row.name}`}>
                    <td>{row.name}</td>
                    {columns.map((m) => <td key={m} className="num">{cell(row.byMonth, m)}</td>)}
                    <td className="num sum sum-last">{money(row.sumCents)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Monthly sum {area.areaName}</td>
                  {columns.map((m) => <td key={m} className="num">{cell(area.monthlySum, m)}</td>)}
                  <td className="num sum sum-last">{money(area.sumCents)}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="total">
              <td>TOTAL</td>
              {columns.map((m) => <td key={m} className="num">{cell(block.total.byMonth, m)}</td>)}
              <td className="num sum sum-last">{money(block.total.sumCents)}</td>
            </tr>
          </tbody>
        </table>
      </TableBox>
    </Panel>
  );
}

/** What the team's own cash does month by month, starting from the BANK balance. */
function TeamFundTable({ gantt }: { gantt: Gantt }) {
  const { rows, categories } = gantt.teamFund;
  const sort = useSort<TeamFundRow>({
    month: (r) => r.month,
    inflow: (r) => r.inflowCents,
    all: (r) => r.outflowAllCents,
    ...Object.fromEntries(categories.map((c) => [`category:${c}`, (r: TeamFundRow) => r.outflowByCategory[c] ?? 0])),
    vat: (r) => r.outflowVatCents,
    final: (r) => r.finalCents,
  });
  if (rows.length === 0) return null;

  return (
    <Panel title="Team's fund">
      <BarsChart
        title="Monthly Outflow (All)"
        data={rows.map((r) => ({ month: month(r.month), outflow: r.outflowAllCents }))}
        xKey="month"
        series={[{ key: "outflow", label: "OUTFLOW ALL" }]}
      />
      <TableBox title="Team's fund monthly outflow">
        <table className="data-table frozen">
          <thead>
            <tr>
              <SortTh sort={sort} by="month">MONTH</SortTh>
              <SortTh sort={sort} by="inflow" className="num">INFLOW</SortTh>
              <SortTh sort={sort} by="all" className="num">OUTFLOW ALL</SortTh>
              {categories.map((c) => <SortTh key={c} sort={sort} by={`category:${c}`} className="num">{`OUTFLOW ${c.toUpperCase()}`}</SortTh>)}
              <SortTh sort={sort} by="vat" className="num">OUTFLOW VAT</SortTh>
              <SortTh sort={sort} by="final" className="num sum sum-last">FINAL ALL</SortTh>
            </tr>
          </thead>
          <tbody>
            {sort.sorted(rows).map((row) => (
              <tr key={row.month}>
                <td className="bold">{month(row.month)}</td>
                <td className="num">{money(row.inflowCents, true)}</td>
                <td className="num">{money(row.outflowAllCents, true)}</td>
                {categories.map((c) => <td key={c} className="num">{money(row.outflowByCategory[c] ?? 0, true)}</td>)}
                <td className="num">{money(row.outflowVatCents, true)}</td>
                <td
                  className={`num sum sum-last bold ${row.finalCents === null ? "" : row.finalCents < 0 ? "cell-negative" : "cell-positive"}`}
                >
                  {row.finalCents === null ? "" : money(row.finalCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
    </Panel>
  );
}
