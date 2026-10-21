import { CartesianGrid, Line, LineChart as RechartsLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { moneyE4 } from "../lib/format";

/**
 * A line of unit prices (in ten-thousandths of a euro) over time: what something cost on each
 * day or month. A gap (null) means "not bought yet" and is left as a gap.
 */
export function LineChart({
  title, data, height = 240,
}: {
  title: string;
  data: { label: string; e4: number | null }[];
  height?: number;
}) {
  if (data.every((point) => point.e4 === null)) return null;
  const points = data.map((point) => ({ label: point.label, euros: point.e4 === null ? null : point.e4 / 10_000 }));
  return (
    <figure className="chart">
      <figcaption className="bold">{title}</figcaption>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLine data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--stroke-sub)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--text-sub)" tick={{ fontSize: 11 }} />
          <YAxis stroke="var(--text-sub)" tick={{ fontSize: 11 }} tickFormatter={(v: number) => moneyE4(Math.round(v * 10_000))} width={84} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value) => moneyE4(Math.round(Number(value) * 10_000))}
            contentStyle={{ background: "var(--bg-soft)", border: "1px solid var(--stroke-sub)", borderRadius: 2, color: "var(--text-strong)", fontSize: 12 }}
          />
          <Line type="stepAfter" dataKey="euros" name="Price" stroke="var(--utility-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </RechartsLine>
      </ResponsiveContainer>
    </figure>
  );
}
