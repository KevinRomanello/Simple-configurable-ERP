import { CartesianGrid, Line, LineChart as RechartsLine, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";
import { chartTable } from "../lib/export/chart";
import { moneyE4, quantity } from "../lib/format";
import { ChartFigure } from "./ExportBlocks";

/** What one part of a made item cost at a point of the line, and what it cost at the point before. */
export interface PartLine {
  name: string;
  quantityMilli: number;
  e4: number | null;
  before: number | null;
}

interface Point {
  label: string;
  euros: number | null;
  parts?: PartLine[];
}

/** The box that appears over a point: the price and, if the point knows them, the price of each part, with the ones that changed marked. */
function PointTip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as Point | undefined;
  if (!active || !point) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-head">
        <strong>{point.label}</strong>
        <span>{point.euros === null ? "" : moneyE4(Math.round(point.euros * 10_000))}</span>
      </div>
      {point.parts && (
        <table>
          <tbody>
            {point.parts.map((part) => {
              const changed = part.e4 !== null && part.before !== null && part.e4 !== part.before;
              return (
                <tr key={part.name} className={changed ? (part.e4! > part.before! ? "up" : "down") : undefined}>
                  <td>{part.name}</td>
                  <td className="num">× {quantity(part.quantityMilli)}</td>
                  <td className="num">{part.e4 === null ? "never bought" : moneyE4(part.e4)}</td>
                  <td>{changed ? `${part.e4! > part.before! ? "▲" : "▼"} was ${moneyE4(part.before!)}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * A line of unit prices (in ten-thousandths of a euro) over time: what something cost on each
 * day or month. A gap (null) means "not bought yet" and is left as a gap. A point can carry the
 * price of each part of what it is the cost of: the box over the point then tells why it went up.
 */
export function LineChart({
  title, data, height = 240,
}: {
  title: string;
  data: { label: string; e4: number | null; parts?: PartLine[] }[];
  height?: number;
}) {
  if (data.every((point) => point.e4 === null)) return null;
  const points: Point[] = data.map((point) => ({ label: point.label, euros: point.e4 === null ? null : point.e4 / 10_000, parts: point.parts }));
  const table = chartTable(
    "",
    ["Price"],
    points.filter((point) => point.euros !== null).map((point) => ({ name: point.label, values: [point.euros!] })),
  );
  return (
    <ChartFigure title={title} legend={[]} table={table}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLine data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--stroke-sub)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--text-sub)" tick={{ fontSize: 11 }} />
          <YAxis stroke="var(--text-sub)" tick={{ fontSize: 11 }} tickFormatter={(v: number) => moneyE4(Math.round(v * 10_000))} width={84} domain={["auto", "auto"]} />
          <Tooltip content={PointTip} />
          <Line type="stepAfter" dataKey="euros" name="Price" stroke="var(--utility-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </RechartsLine>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
