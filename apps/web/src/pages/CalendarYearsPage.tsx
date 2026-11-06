import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { CalendarYears } from "../api/types";
import { DataTable, Loading, PageHeader, Panel, type Column } from "../components/ui";
import { money } from "../lib/format";

type Row = CalendarYears["rows"][number];
type Figures = Row["estimate"];

const PHASES = [
  { phase: "estimate", label: "EXPECTED" },
  { phase: "actual", label: "ACTUAL" },
] as const;

const COLUMNS: Column<Row>[] = [
  { key: "year", header: "YEAR", cellClass: () => "bold", sort: (r) => r.year ?? "9999", cell: (r) => r.year ?? "No date yet" },
  ...PHASES.flatMap(({ phase, label }): Column<Row>[] => [
    { key: `${phase}-gross`, header: `${label} GRAND TOTAL`, num: true, sort: (r) => r[phase].grossCents, cell: (r) => money(r[phase].grossCents) },
    { key: `${phase}-outflow`, header: `${label} OUTFLOW`, num: true, sort: (r) => r[phase].outflowCents, cell: (r) => money(r[phase].outflowCents) },
    { key: `${phase}-vat`, header: `${label} VAT (TEAM)`, num: true, sort: (r) => r[phase].teamVatCents, cell: (r) => money(r[phase].teamVatCents) },
  ]),
];

function TotalRow({ total }: { total: CalendarYears["total"] }) {
  const cells = (f: Figures) => [f.grossCents, f.outflowCents, f.teamVatCents];
  return (
    <tr className="total">
      <td className="bold">TOTAL</td>
      {[...cells(total.estimate), ...cells(total.actual)].map((cents, index) => (
        <td key={index} className="num">{money(cents)}</td>
      ))}
    </tr>
  );
}

/**
 * The purchases of every season by calendar year, for the accounts of the association: the only page
 * that does not follow the season chosen in the menu. Not designed in Figma: the table of TOTAL.
 */
export function CalendarYearsPage() {
  const years = useQuery({ queryKey: ["calendar-years"], queryFn: api.calendarYears });
  if (!years.data) return <Loading />;
  return (
    <>
      <PageHeader
        title="CALENDAR YEARS"
        description="Every season together: each purchase is in the year (1 January - 31 December) of its purchase date, EXPECTED and ACTUAL each by its own date. It does not change with the season chosen in the menu. VAT (TEAM) is the VAT the team pays out of its own money."
      />
      <Panel>
        <DataTable
          title="Calendar years"
          columns={COLUMNS}
          rows={years.data.rows}
          rowKey={(r) => r.year ?? "none"}
          empty="No purchases yet"
          footer={<TotalRow total={years.data.total} />}
        />
      </Panel>
    </>
  );
}
