import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { useParams } from "react-router";
import { api } from "../api/client";
import type { Gantt, Phase } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { blockTitle } from "../lib/blocks";
import { money, month } from "../lib/format";

/** EXPECTED GANTT / ACTUAL GANTT: outflows per area, project and month, and the team fund balance. */
export function GanttPage() {
  const { phase = "estimate" } = useParams();
  const current: Phase = phase === "actual" ? "actual" : "estimate";
  const gantt = useQuery({ queryKey: ["gantt", current], queryFn: () => api.gantt(current) });
  const [block, setBlock] = useState("ALL");

  if (!gantt.data) return <p className="empty">Loading…</p>;
  const data = gantt.data;
  const selected = data.blocks.find((b) => b.block === block) ?? data.blocks[0];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{current === "estimate" ? "EXPECTED" : "ACTUAL"} GANTT</h1>
          <p className="muted">
            Outflow per month. When the team pays the VAT, only the net leaves on the purchase date and the VAT leaves on its deadline.
          </p>
        </div>
      </header>

      {data.blocks.length === 0 ? (
        <p className="empty">No purchase has a date yet.</p>
      ) : (
        <>
          <Chips
            label="Block"
            value={selected!.block}
            onChange={setBlock}
            options={data.blocks.map((b) => ({ value: b.block, label: blockTitle(b.block) }))}
          />
          <BlockTable gantt={data} blockName={selected!.block} />
        </>
      )}

      <TeamFundTable gantt={data} />
    </>
  );
}

function BlockTable({ gantt, blockName }: { gantt: Gantt; blockName: string }) {
  const block = gantt.blocks.find((b) => b.block === blockName);
  if (!block) return null;
  const columns = gantt.months;
  const cell = (byMonth: Record<string, number>, key: string) => money(byMonth[key] ?? 0, true);
  const chartData = columns.map((m) => ({
    month: month(m),
    ...Object.fromEntries(block.areas.map((area) => [area.areaName, area.monthlySum[m] ?? 0])),
  }));

  return (
    <section className="panel">
      <h2>{blockTitle(blockName)}</h2>
      <BarsChart
        title={`Monthly Outflow Timeline (${blockName === "ALL" ? "All Items" : blockName})`}
        data={chartData}
        xKey="month"
        series={block.areas.map((a) => ({ key: a.areaName, label: a.areaName }))}
        stacked
      />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>PROJECT</th>
              {columns.map((m) => <th key={m} className="num">{month(m)}</th>)}
              <th className="num">SUM PROJECT</th>
            </tr>
          </thead>
          <tbody>
            {block.areas.map((area) => (
              <Fragment key={area.areaCode}>
                <tr className="group"><td colSpan={columns.length + 2}>{area.areaName}</td></tr>
                {area.rows.map((row) => (
                  <tr key={`${area.areaCode}-${row.name}`}>
                    <td>{row.name}</td>
                    {columns.map((m) => <td key={m} className="num">{cell(row.byMonth, m)}</td>)}
                    <td className="num">{money(row.sumCents)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Monthly sum {area.areaName}</td>
                  {columns.map((m) => <td key={m} className="num">{cell(area.monthlySum, m)}</td>)}
                  <td className="num">{money(area.sumCents)}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="total">
              <td>TOTAL</td>
              {columns.map((m) => <td key={m} className="num">{cell(block.total.byMonth, m)}</td>)}
              <td className="num">{money(block.total.sumCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** What the team's own cash does month by month, starting from the BANK balance. */
function TeamFundTable({ gantt }: { gantt: Gantt }) {
  const { rows, categories } = gantt.teamFund;
  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <h2>Team's fund</h2>
      <BarsChart
        title="Monthly Outflow (All)"
        data={rows.map((r) => ({ month: month(r.month), outflow: r.outflowAllCents }))}
        xKey="month"
        series={[{ key: "outflow", label: "OUTFLOW ALL" }]}
      />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>MONTH</th>
              <th className="num">INFLOW</th>
              <th className="num">OUTFLOW ALL</th>
              {categories.map((c) => <th key={c} className="num">OUTFLOW {c.toUpperCase()}</th>)}
              <th className="num">OUTFLOW VAT</th>
              <th className="num">FINAL ALL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <td className="bold">{month(row.month)}</td>
                <td className="num">{money(row.inflowCents, true)}</td>
                <td className="num">{money(row.outflowAllCents, true)}</td>
                {categories.map((c) => <td key={c} className="num">{money(row.outflowByCategory[c] ?? 0, true)}</td>)}
                <td className="num">{money(row.outflowVatCents, true)}</td>
                <td
                  className={`num bold ${row.finalCents === null ? "" : row.finalCents < 0 ? "cell-negative" : "cell-positive"}`}
                >
                  {row.finalCents === null ? "" : money(row.finalCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
