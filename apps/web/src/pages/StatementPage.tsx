import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { StatementRow } from "../api/types";
import { TableBox } from "../components/ExportBlocks";
import { Field, Loading, Message, PageHeader, Panel, Table } from "../components/ui";
import { useMe } from "../lib/auth";
import { money } from "../lib/format";

/**
 * FINANCIAL STATEMENT: the table of income and costs the team must show, the same as the sheet "voci di ricavocosto"
 * (same rows, same order, same way of adding up, defects included). It is worked out from the register, for a calendar
 * year. docs/registro-di-cassa.md
 */
export function StatementPage() {
  const { canManageCash } = useMe().permissions;
  const [year, setYear] = useState<number | undefined>();
  const statement = useQuery({ queryKey: ["cash-statement", year ?? "now"], queryFn: () => api.cashStatement(year), enabled: canManageCash });

  if (!canManageCash) return <Message>Only the treasury and the admins can see the financial statement.</Message>;
  if (!statement.data) return <Loading />;
  const { rows, years, year: shown } = statement.data;

  return (
    <>
      <PageHeader
        title="FINANCIAL STATEMENT"
        description="The income and the costs of a year, in the same rows and with the same way of adding up as the sheet of the treasury, worked out from the register."
        actions={
          <Field label="Year" htmlFor="statement-year">
            <select id="statement-year" className="input small" value={shown} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        }
      />

      <Panel>
        <TableBox title={`Financial statement ${shown}`}>
          <Table className="statement">
            <tbody>
              {rows.map((row) => <StatementLine key={row.row} row={row} year={shown} />)}
            </tbody>
          </Table>
        </TableBox>
      </Panel>
    </>
  );
}

/** A row of the table: the sheet's three columns, the label, the amount and the amount without sign. */
function StatementLine({ row, year }: { row: StatementRow; year: number }) {
  if (row.kind === "blank") return <tr className="st-blank"><td colSpan={3} /></tr>;
  const kind = row.kind === "sum" && row.total ? "total" : row.kind;
  return (
    <tr className={`st-${kind}${row.bold ? " bold" : ""}`}>
      <td>{row.label}</td>
      <td className="num">{row.kind === "title" ? year : row.cents === null ? "" : money(row.cents)}</td>
      <td className="num">{row.kind === "title" ? `importi parziali ${year}` : row.partialCents === null ? "" : money(row.partialCents)}</td>
    </tr>
  );
}
