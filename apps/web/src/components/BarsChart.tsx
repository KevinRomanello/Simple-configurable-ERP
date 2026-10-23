import { chartTable } from "../lib/export/chart";
import { moneyShort, money } from "../lib/format";
import { ChartFigure } from "./ExportBlocks";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Series {
  key: string;
  label: string;
}

/** Series colours: the "Utility" palette of the design system, in order. */
const COLOURS = ["var(--utility-1)", "var(--utility-2)", "var(--utility-3)", "var(--utility-4)", "var(--utility-5)", "var(--utility-6)"];

/**
 * The column chart used by every view that had one in the old sheet. Values are in cents;
 * `stacked` piles the series up (spending per area) instead of putting them side by side.
 */
export function BarsChart({
  title, data, xKey, series, stacked = false, height = 300,
}: {
  title: string;
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  stacked?: boolean;
  height?: number;
}) {
  if (data.length === 0) return null;
  const euros = data.map((row) => ({
    ...row,
    ...Object.fromEntries(series.map((s) => [s.key, Number(row[s.key] ?? 0) / 100])),
  }));

  const legend = series.map((s, i) => ({ label: s.label, color: COLOURS[i % COLOURS.length]! }));
  const table = chartTable(
    "",
    series.map((s) => s.label),
    euros.map((row) => ({ name: String(row[xKey]), values: series.map((s) => Number(row[s.key])) })),
  );

  return (
    <ChartFigure title={title} legend={legend} table={table}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={euros} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--stroke-sub)" vertical={false} />
          <XAxis dataKey={xKey} stroke="var(--text-sub)" tick={{ fontSize: 11 }} />
          <YAxis stroke="var(--text-sub)" tick={{ fontSize: 11 }} tickFormatter={(v: number) => moneyShort(v)} width={84} />
          <Tooltip
            formatter={(value) => money(Math.round(Number(value) * 100))}
            contentStyle={{ background: "var(--bg-soft)", border: "1px solid var(--stroke-sub)", borderRadius: 2, color: "var(--text-strong)", fontSize: 12 }}
            cursor={{ fill: "var(--bg-soft)" }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLOURS[i % COLOURS.length]} stackId={stacked ? "stack" : undefined} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
