import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { MoneyIn, Phase, TotalsBlock, TotalsFigures, TotalsView } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { DataTable, Field, Loading, PageHeader, Panel, type Column } from "../components/ui";
import { blockTitle } from "../lib/blocks";
import { date, money, ratio } from "../lib/format";
import { useSeasons } from "../lib/season";
import { todayIso } from "../lib/today";
import { choicesOf, compareMoney, compareRows, rowsOf, type ComparedRow, type TotalsKind, type TotalsRowView } from "../lib/totals";

// SEASON TOTAL, YEAR TOTAL and CAR TOTAL: the TOTAL of the old sheet for a season, a calendar year
// or a car, chosen here and not in the menu (today's to start with), what came in, and the comparison
// with another one. Not designed in Figma: the table of TOTAL and the models of the interface.
// docs/stagioni-anni-fiscali-e-macchine.md

const TEXT: Record<TotalsKind, { title: string; what: string; description: string }> = {
  season: {
    title: "SEASON TOTAL",
    what: "Season",
    description: "The budget of one season, expected against actual, by area or by project, and what came in. It does not follow the season chosen in the menu.",
  },
  year: {
    title: "YEAR TOTAL",
    what: "Calendar year",
    description:
      "Every season together: each phase is in the year (1 January - 31 December) of its own purchase date, and so is the money that came in. A line planned in December and bought in January is in both years.",
  },
  car: {
    title: "CAR TOTAL",
    what: "Car",
    description:
      "Every season together: the lines bought for this car, that is the car of their season or the one chosen on the line. Money has no car: nothing came in here.",
  },
};

const PHASES: { value: Phase; label: string }[] = [
  { value: "estimate", label: "EXPECTED" },
  { value: "actual", label: "ACTUAL" },
];

function fetchTotals(kind: TotalsKind, value: string): Promise<TotalsView> {
  if (kind === "season") return api.totals(Number(value));
  return kind === "year" ? api.yearTotals(Number(value)) : api.carTotals(value);
}

/** The first columns of a row: its area, and its project when the rows are projects. */
function labelColumns<T extends { areaName: string; project: string | null }>(byProject: boolean): Column<T>[] {
  const area: Column<T> = { key: "area", header: "AREA", sort: (r) => r.areaName, cellClass: () => "bold", cell: (r) => r.areaName };
  return byProject ? [area, { key: "project", header: "PROJECT", sort: (r) => r.project ?? "", cell: (r) => r.project }] : [area];
}

const FIGURES: Column<TotalsRowView>[] = [
  { key: "estGross", header: "ESTIMATED GRAND TOTAL COST", num: true, sort: (r) => r.figures.estimateGrossCents, cell: (r) => money(r.figures.estimateGrossCents) },
  { key: "estOutflow", header: "EXPECTED OUTFLOW", num: true, sort: (r) => r.figures.estimateOutflowCents, cell: (r) => money(r.figures.estimateOutflowCents) },
  { key: "actGross", header: "ACTUAL GRAND TOTAL COST", num: true, sort: (r) => r.figures.actualGrossCents, cell: (r) => money(r.figures.actualGrossCents) },
  { key: "actOutflow", header: "ACTUAL OUTFLOW", num: true, sort: (r) => r.figures.actualOutflowCents, cell: (r) => money(r.figures.actualOutflowCents) },
  {
    key: "variance",
    header: "OUTFLOW VARIANCE",
    num: true,
    className: "sum",
    sort: (r) => r.figures.outflowVariance ?? null,
    cellClass: (r) => (r.figures.outflowOutOfRange ? "cell-negative" : undefined),
    cell: (r) => ratio(r.figures.outflowVariance),
  },
];

/** The TOTAL row: its outflows are green within budget, red beyond. */
function TotalRow({ total, labels }: { total: TotalsBlock["total"]; labels: number }) {
  const outflow = total.outflowStatus === "within" ? "cell-positive" : "cell-negative";
  return (
    <tr className="total">
      <td className="bold" colSpan={labels}>TOTAL</td>
      <td className="num">{money(total.estimateGrossCents)}</td>
      <td className={`num ${outflow}`}>{money(total.estimateOutflowCents)}</td>
      <td className="num">{money(total.actualGrossCents)}</td>
      <td className={`num ${outflow}`}>{money(total.actualOutflowCents)}</td>
      <td className={`num sum${total.outflowOutOfRange ? " cell-negative" : ""}`}>{ratio(total.outflowVariance)}</td>
    </tr>
  );
}

/** The columns of a comparison: A, B, how much more or less, and by how much. */
function comparedColumns<T extends ComparedRow>(header: string, a: string, b: string): Column<T>[] {
  return [
    { key: "a", header: `${header} · ${a}`, num: true, sort: (r) => r.a, cell: (r) => money(r.a) },
    { key: "b", header: `${header} · ${b}`, num: true, sort: (r) => r.b, cell: (r) => money(r.b) },
    { key: "difference", header: "DIFFERENCE", num: true, sort: (r) => r.difference, cell: (r) => `${r.difference > 0 ? "+" : ""}${money(r.difference)}` },
    { key: "ratio", header: "%", num: true, className: "sum", sort: (r) => r.ratio, cell: (r) => ratio(r.ratio) },
  ];
}

function ComparedTotalRow({ a, b, labels }: { a: number; b: number; labels: number }) {
  return (
    <tr className="total">
      <td className="bold" colSpan={labels}>TOTAL</td>
      <td className="num">{money(a)}</td>
      <td className="num">{money(b)}</td>
      <td className="num">{`${b - a > 0 ? "+" : ""}${money(b - a)}`}</td>
      <td className="num sum">{a === 0 ? "" : ratio((b - a) / a)}</td>
    </tr>
  );
}

const outflowOf = (phase: Phase) => (f: TotalsFigures) => (phase === "estimate" ? f.estimateOutflowCents : f.actualOutflowCents);

export function TotalPage({ kind }: { kind: TotalsKind }) {
  const seasons = useSeasons().data;
  const [chosen, setChosen] = useState("");
  const [compareWith, setCompareWith] = useState("");
  const [byProject, setByProject] = useState(false);
  const [blockName, setBlockName] = useState("ALL");
  const [phase, setPhase] = useState<Phase>("actual");
  const options = seasons ? choicesOf(kind, seasons, todayIso()) : null;
  const value = chosen || options?.current || "";
  const main = useQuery({ queryKey: ["totals", kind, value], queryFn: () => fetchTotals(kind, value), enabled: value !== "" });
  const other = useQuery({ queryKey: ["totals", kind, compareWith], queryFn: () => fetchTotals(kind, compareWith), enabled: compareWith !== "" });
  if (!options || !main.data) return <Loading />;

  const text = TEXT[kind];
  const nameOf = (v: string) => options.choices.find((c) => c.value === v)?.label.replace(" (current)", "") ?? v;
  const data = main.data;
  const block = data.blocks.find((b) => b.block === blockName) ?? data.blocks[0]!;
  const otherBlock = other.data?.blocks.find((b) => b.block === block.block);
  const rows = rowsOf(block, byProject);
  const labels = byProject ? 2 : 1;
  const a = nameOf(value);
  const b = nameOf(compareWith);
  const undated = data.undated && (data.undated.estimate > 0 || data.undated.actual > 0)
    ? ` Without a purchase date, in no year: ${money(data.undated.estimate)} expected, ${money(data.undated.actual)} actual.`
    : "";

  return (
    <>
      <PageHeader title={text.title} description={text.description + undated} />
      <Panel>
        <div className="inline-form">
          <Field label={text.what} htmlFor="total-choice">
            <select id="total-choice" className="input small" value={value} onChange={(e) => setChosen(e.target.value)}>
              {options.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Compare with" htmlFor="total-compare">
            <select id="total-compare" className="input small" value={compareWith} onChange={(e) => setCompareWith(e.target.value)}>
              <option value="">Nothing</option>
              {options.choices.filter((c) => c.value !== value).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <Chips label="Rows" value={byProject ? "project" : "area"} onChange={(v) => setByProject(v === "project")} options={[{ value: "area", label: "Areas" }, { value: "project", label: "Projects" }]} />
        <Chips label="Block" value={block.block} onChange={setBlockName} options={data.blocks.map((x) => ({ value: x.block, label: blockTitle(x.block) }))} />
        {compareWith !== "" && <Chips label="Phase" value={phase} onChange={setPhase} options={PHASES} />}
        <h2>{blockTitle(block.block)}</h2>

        {compareWith === "" ? (
          <>
            <DataTable
              title={`${text.title} ${a} (${blockTitle(block.block)})`}
              columns={[...labelColumns<TotalsRowView>(byProject), ...FIGURES]}
              rows={rows}
              rowKey={(r) => r.key}
              empty="Nothing in it"
              footer={<TotalRow total={block.total} labels={labels} />}
            />
            <BarsChart
              title={`Cost & Outflow Comparison (${a}, ${blockTitle(block.block)})`}
              data={rows.map((r) => ({
                label: r.project ? `${r.areaName} · ${r.project}` : r.areaName,
                estGross: r.figures.estimateGrossCents,
                actGross: r.figures.actualGrossCents,
                estOutflow: r.figures.estimateOutflowCents,
                actOutflow: r.figures.actualOutflowCents,
              }))}
              xKey="label"
              series={[
                { key: "estGross", label: "Estimated grand total cost" },
                { key: "actGross", label: "Actual grand total cost" },
                { key: "estOutflow", label: "Expected outflow" },
                { key: "actOutflow", label: "Actual outflow" },
              ]}
            />
          </>
        ) : !otherBlock ? (
          <Loading />
        ) : (
          <Compared rows={compareRows(rows, rowsOf(otherBlock, byProject), outflowOf(phase))} total={[outflowOf(phase)(block.total), outflowOf(phase)(otherBlock.total)]}
            header={`${PHASES.find((p) => p.value === phase)!.label} OUTFLOW`} a={a} b={b} labels={labels} byProject={byProject} block={block.block} />
        )}
      </Panel>

      {kind === "car" ? null : compareWith !== "" && other.data?.moneyIn ? (
        <ComparedMoney a={data.moneyIn!} b={other.data.moneyIn} phase={phase} nameA={a} nameB={b} />
      ) : (
        <MoneyInPanel money={data.moneyIn!} outflow={data.blocks[0]!.total} name={a} />
      )}
    </>
  );
}

function Compared({ rows, total, header, a, b, labels, byProject, block }: {
  rows: ComparedRow[]; total: [number, number]; header: string; a: string; b: string; labels: number; byProject: boolean; block: string;
}) {
  return (
    <>
      <DataTable
        title={`${a} against ${b} (${blockTitle(block)})`}
        columns={[...labelColumns<ComparedRow>(byProject), ...comparedColumns<ComparedRow>(header, a, b)]}
        rows={rows}
        rowKey={(r) => r.key}
        empty="Nothing in either"
        footer={<ComparedTotalRow a={total[0]} b={total[1]} labels={labels} />}
      />
      <BarsChart
        title={`${header}: ${a} and ${b}`}
        data={rows.map((r) => ({ label: r.project ? `${r.areaName} · ${r.project}` : r.areaName, a: r.a, b: r.b }))}
        xKey="label"
        series={[{ key: "a", label: a }, { key: "b", label: b }]}
      />
    </>
  );
}

type MoneyRow = MoneyIn["rows"][number];
const KIND: Record<MoneyRow["kind"], string> = { bank: "the account", sponsor: "sponsor", inflow: "inflow" };

/** What came in, source by source, and against what went out. */
function MoneyInPanel({ money: moneyIn, outflow, name }: { money: MoneyIn; outflow: TotalsFigures; name: string }) {
  const sources: Column<MoneyRow>[] = [
    { key: "from", header: "FROM", cellClass: () => "bold", cell: (r) => (r.kind === "bank" && r.asOf ? `BANK (${date(r.asOf)})` : r.label) },
    { key: "kind", header: "WHAT", cellClass: () => "muted", cell: (r) => KIND[r.kind] },
    { key: "estimate", header: "EXPECTED", num: true, sort: (r) => r.estimateCents, cell: (r) => money(r.estimateCents) },
    { key: "actual", header: "ACTUAL", num: true, sort: (r) => r.actualCents, cell: (r) => money(r.actualCents) },
  ];
  const balance = [
    { label: "MONEY IN", estimate: moneyIn.total.estimate, actual: moneyIn.total.actual },
    { label: "OUTFLOW", estimate: outflow.estimateOutflowCents, actual: outflow.actualOutflowCents },
    { label: "MONEY IN - OUTFLOW", estimate: moneyIn.total.estimate - outflow.estimateOutflowCents, actual: moneyIn.total.actual - outflow.actualOutflowCents },
  ];
  type Balance = (typeof balance)[number];
  const balanceColumns: Column<Balance>[] = [
    { key: "label", header: name, cellClass: () => "bold", cell: (r) => r.label },
    { key: "estimate", header: "EXPECTED", num: true, cellClass: (r) => (r.estimate < 0 ? "cell-negative" : undefined), cell: (r) => money(r.estimate) },
    { key: "actual", header: "ACTUAL", num: true, cellClass: (r) => (r.actual < 0 ? "cell-negative" : undefined), cell: (r) => money(r.actual) },
  ];
  return (
    <Panel title="Money in">
      <p className="muted">
        The money of the sponsors, the inflows of CASH FLOW and, for a season, the BANK, against the outflow of every line (block ALL). The
        VAT the team owes on its inflows is not here: CASH FLOW has it.
      </p>
      <DataTable title={`Money in and out ${name}`} columns={balanceColumns} rows={balance} rowKey={(r) => r.label} rowClass={(r) => (r.label === "MONEY IN - OUTFLOW" ? "total" : undefined)} />
      <DataTable
        title={`Money in ${name}`}
        columns={sources}
        rows={moneyIn.rows}
        rowKey={(r) => `${r.kind}:${r.label}`}
        empty="Nothing came in"
        footer={
          <tr className="total">
            <td className="bold" colSpan={2}>MONEY IN</td>
            <td className="num">{money(moneyIn.total.estimate)}</td>
            <td className="num">{money(moneyIn.total.actual)}</td>
          </tr>
        }
      />
    </Panel>
  );
}

function ComparedMoney({ a, b, phase, nameA, nameB }: { a: MoneyIn; b: MoneyIn; phase: Phase; nameA: string; nameB: string }) {
  type Row = ReturnType<typeof compareMoney>[number];
  const header = `${PHASES.find((p) => p.value === phase)!.label} MONEY IN`;
  const columns: Column<Row>[] = [{ key: "from", header: "FROM", cellClass: () => "bold", cell: (r) => r.label }, ...comparedColumns<Row>(header, nameA, nameB)];
  return (
    <Panel title="Money in">
      <DataTable
        title={`Money in, ${nameA} against ${nameB}`}
        columns={columns}
        rows={compareMoney(a, b, phase)}
        rowKey={(r) => r.key}
        empty="Nothing came in"
        footer={<ComparedTotalRow a={a.total[phase]} b={b.total[phase]} labels={1} />}
      />
    </Panel>
  );
}
