import { faCircleCheck, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { StatementIssue, StatementRow } from "../api/types";
import { Button } from "../components/Button";
import { TableBox } from "../components/ExportBlocks";
import { Field, Loading, Message, PageHeader, Panel } from "../components/ui";
import { useMe } from "../lib/auth";
import { money } from "../lib/format";
import { issueText } from "../lib/statement";

/**
 * FINANCIAL STATEMENT: the table of income and costs the team must show, the same as the sheet "voci di ricavocosto"
 * (same rows, same order, same way of adding up, defects included). It is worked out from the register, for a calendar
 * year. "Things to check" explains where that way of adding up can mislead. docs/registro-di-cassa.md
 */
export function StatementPage() {
  const { canManageCash } = useMe().permissions;
  const [year, setYear] = useState<number | undefined>();
  const [checking, setChecking] = useState(false);
  const statement = useQuery({ queryKey: ["cash-statement", year ?? "now"], queryFn: () => api.cashStatement(year), enabled: canManageCash });

  if (!canManageCash) return <Message>Only the treasury and the admins can see the financial statement.</Message>;
  if (!statement.data) return <Loading />;
  const { rows, issues, years, year: shown } = statement.data;
  const found = issues.filter((i) => i.count > 0);
  const flagged = new Set(found.flatMap((i) => (i.row === null ? [] : [i.row])));

  return (
    <>
      <PageHeader
        title="FINANCIAL STATEMENT"
        description="The income and the costs of a year, in the same rows and with the same way of adding up as the sheet of the treasury, worked out from the register. Things to check explains where that way of adding up can mislead."
        actions={
          <>
            <Field label="Year" htmlFor="statement-year">
              <select id="statement-year" className="input small" value={shown} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Button icon={found.length > 0 ? faTriangleExclamation : faCircleCheck} variant={checking ? "ghost" : "primary"} onClick={() => setChecking(!checking)}>
              {checking ? "Close" : `Things to check (${found.length})`}
            </Button>
          </>
        }
      />

      {checking && <ThingsToCheck year={shown} issues={issues} />}

      <Panel>
        <TableBox title={`Financial statement ${shown}`}>
          <table className="data-table statement">
            <tbody>
              {rows.map((row) => <StatementLine key={row.row} row={row} year={shown} flagged={flagged.has(row.row)} />)}
            </tbody>
          </table>
        </TableBox>
      </Panel>
    </>
  );
}

/** A row of the table: the sheet's three columns, the label, the amount and the amount without sign. */
function StatementLine({ row, year, flagged }: { row: StatementRow; year: number; flagged: boolean }) {
  if (row.kind === "blank") return <tr className="st-blank"><td colSpan={3} /></tr>;
  const kind = row.kind === "sum" && row.total ? "total" : row.kind;
  return (
    <tr className={`st-${kind}${row.bold ? " bold" : ""}`}>
      <td>
        {row.label}
        {flagged && <span className="st-flag" title="See Things to check"><FontAwesomeIcon icon={faTriangleExclamation} /></span>}
      </td>
      <td className="num">{row.kind === "title" ? year : row.cents === null ? "" : money(row.cents)}</td>
      <td className="num">{row.kind === "title" ? `importi parziali ${year}` : row.partialCents === null ? "" : money(row.partialCents)}</td>
    </tr>
  );
}

/** What the statement cannot show by itself: the places where it counts as the sheet does, and what they cost this year. */
function ThingsToCheck({ year, issues }: { year: number; issues: StatementIssue[] }) {
  const found = issues.filter((i) => i.count > 0);
  const quiet = issues.filter((i) => i.count === 0);
  return (
    <Panel title="Things to check">
      <p className="muted">
        The table counts exactly as the sheet does, even where that is not right, so that it is the same as the sheet. The money that falls in those places
        in {year} is listed first; the others touch nothing in {year}, but are good to know.
      </p>
      <h3>In {year}</h3>
      {found.length === 0 ? <p>Nothing found: no money sits in any of the places below.</p> : <IssueList issues={found} />}
      {quiet.length > 0 && (
        <>
          <h3>Nothing in {year}, but the table does this</h3>
          <IssueList issues={quiet} />
        </>
      )}
    </Panel>
  );
}

function IssueList({ issues }: { issues: StatementIssue[] }) {
  return (
    <ul className="issue-list">
      {issues.map((issue) => {
        const text = issueText(issue);
        return (
          <li key={`${issue.kind}-${issue.row}-${issue.label}`}>
            <span className="bold">{text.title}</span>
            <div>{text.what}</div>
            {issue.count > 0 && <div className="bold">{text.now}</div>}
          </li>
        );
      })}
    </ul>
  );
}
