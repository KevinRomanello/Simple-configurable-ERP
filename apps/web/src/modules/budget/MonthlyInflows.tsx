import type { MonthlyInflow, Phase } from "../../core/calcTypes";
import { money, month } from "../../core/format";
import { BarsChart } from "../../core/BarsChart";
import { DataTable, type Column } from "../../core/ui";

const WORD: Record<Phase, string> = { estimate: "Expected", actual: "Actual" };

/** The money that comes in month by month, as a table: the same in CASH FROM and CASH FLOW. */
export function MonthlyTable({ phase, monthly }: { phase: Phase; monthly: MonthlyInflow[] }) {
  const columns: Column<MonthlyInflow>[] = [
    { key: "month", header: "MONTH", sort: (m) => m.month, cell: (m) => month(m.month) },
    { key: "inflow", header: `${WORD[phase].toUpperCase()} INFLOW`, num: true, sort: (m) => m.totalCents, cell: (m) => money(m.totalCents, true) },
    { key: "names", header: "CASH SOURCE", cellClass: () => "lines", cell: (m) => m.names.map((n) => <div key={n}>{n}</div>) },
  ];
  return <DataTable title={`${WORD[phase]} cash inflows per month`} columns={columns} rows={monthly} rowKey={(m) => m.month} empty="No money with a date yet" />;
}

/** The same, as a chart (nothing to draw without a month). */
export function MonthlyChart({ phase, monthly }: { phase: Phase; monthly: MonthlyInflow[] }) {
  if (monthly.length === 0) return <p className="muted">No money with a date yet.</p>;
  return (
    <BarsChart
      title={`${WORD[phase]} Cash Inflows Timeline`}
      data={monthly.map((m) => ({ month: month(m.month), inflow: m.totalCents }))}
      xKey="month"
      series={[{ key: "inflow", label: "Inflow" }]}
      height={240}
    />
  );
}
