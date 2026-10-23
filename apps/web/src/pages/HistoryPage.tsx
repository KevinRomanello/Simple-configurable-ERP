import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { HistoryEntry } from "../api/types";
import { Button } from "../components/Button";
import { useMe } from "../lib/auth";
import { dateTime } from "../lib/format";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

/** Names for the tables of the database, as people know them. */
const TABLES: Record<string, string> = {
  project: "Project",
  budget_line: "Line",
  line_figures: "Figures",
  fund: "Fund",
  fund_contract: "Contract",
  team_inflow: "Inflow",
  bank_snapshot: "BANK",
  supplier: "Supplier",
  app_user: "User",
  user_area: "User area",
};
const ACTION = { insert: "added", update: "changed", delete: "deleted" } as const;

const SORT: SortAccessors<HistoryEntry> = {
  when: (e) => e.at,
  who: (e) => e.actor?.name ?? "system",
  what: (e) => `${TABLES[e.table] ?? e.table} ${ACTION[e.action]}`,
};

const humanField = (field: string) => field.replaceAll("_", " ");
function humanValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/** One line per changed field: "quantity: 1 → 2". */
function Changes({ entry }: { entry: HistoryEntry }) {
  if (entry.action === "update") {
    return (
      <ul className="changes">
        {entry.changes.map((c) => (
          <li key={c.field}>
            <span className="muted">{humanField(c.field)}:</span> {humanValue(c.before)} → {humanValue(c.after)}
          </li>
        ))}
      </ul>
    );
  }
  // Added or deleted rows carry every field: keep them one click away.
  return (
    <details>
      <summary className="muted">{entry.changes.length} fields</summary>
      <ul className="changes">
        {entry.changes.map((c) => (
          <li key={c.field}>
            <span className="muted">{humanField(c.field)}:</span> {humanValue(entry.action === "insert" ? c.after : c.before)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Everything that was changed, who did it and when (admins and project managers). Not designed in Figma yet. */
export function HistoryPage() {
  const allowed = useMe().permissions.canViewHistory;
  const [table, setTable] = useState("");
  const sort = useSort(SORT);
  const history = useInfiniteQuery({
    queryKey: ["history", table],
    queryFn: ({ pageParam }) => api.history({ table: table || undefined, before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: allowed,
  });

  if (!allowed) return <p className="empty">The history is for admins and project managers.</p>;
  const entries = sort.sorted(history.data?.pages.flatMap((page) => page.entries) ?? []);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>History</h1>
          <p className="muted">Every change, newest first. Changes with no person (the first import, an account created at its first sign-in) show as "system".</p>
        </div>
        <div className="actions">
          <div className="field">
            <label htmlFor="history-table">Show</label>
            <select id="history-table" className="input small" value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">everything</option>
              {Object.entries(TABLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <DownloadMenu />
        </div>
      </header>

      <section className="panel">
        <TableBox title="History">
          <table className="data-table history">
            <thead>
              <tr>
                <SortTh sort={sort} by="when">WHEN</SortTh>
                <SortTh sort={sort} by="who">WHO</SortTh>
                <SortTh sort={sort} by="what">WHAT</SortTh>
                <th>DETAILS</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{dateTime(entry.at)}</td>
                  <td>{entry.actor?.name ?? <span className="muted">system</span>}</td>
                  <td>
                    <span className="bold">{TABLES[entry.table] ?? entry.table}</span> {ACTION[entry.action]}
                    {entry.label && <div className="muted">{entry.label}</div>}
                  </td>
                  <td><Changes entry={entry} /></td>
                </tr>
              ))}
              {history.isSuccess && entries.length === 0 && <tr><td colSpan={4} className="empty">No changes yet</td></tr>}
            </tbody>
          </table>
        </TableBox>

        {history.hasNextPage && (
          <div>
            <Button variant="ghost" small disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
              Load older changes
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
