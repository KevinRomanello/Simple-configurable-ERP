import type { MonthlyInflow, Phase } from "../api/types";
import { money, month } from "../lib/format";
import { BarsChart } from "./BarsChart";
import { DataTable, type Column } from "./ui";

const WORD: Record<Phase, string> = { estimate: "Expected", actual: "Actual" };

/** The money that comes in month by month, as a chart and a table: the same in CASH FROM and CASH FLOW. */
export function MonthlyInflows({ phase, monthly }: { phase: Phase; monthly: MonthlyInflow[] }) {
  if (monthly.length === 0) return null;
  const columns: Column<MonthlyInflow>[] = [
    { key: "month", header: "MONTH", sort: (m) => m.month, cell: (m) => month(m.month) },
    { key: "inflow", header: `${WORD[phase].toUpperCase()} INFLOW`, num: true, sort: (m) => m.totalCents, cell: (m) => money(m.totalCents, true) },
    { key: "names", header: "CASH SOURCE", cellClass: () => "lines", cell: (m) => m.names.map((n) => <div key={n}>{n}</div>) },
  ];
  return (
    <>
      <BarsChart
        title={`${WORD[phase]} Cash Inflows Timeline`}
        data={monthly.map((m) => ({ month: month(m.month), inflow: m.totalCents }))}
        xKey="month"
        series={[{ key: "inflow", label: "Inflow" }]}
        height={240}
      />
      <DataTable title={`${WORD[phase]} cash inflows per month`} columns={columns} rows={monthly} rowKey={(m) => m.month} />
    </>
  );
}
