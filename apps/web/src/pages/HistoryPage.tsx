import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { HistoryEntry } from "../api/types";
import { Button } from "../components/Button";
import { useMe } from "../lib/auth";
import { dateTime } from "../lib/format";
import { DataTable, Field, Message, PageHeader, Panel, type Column } from "../components/ui";

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
  category: "Category",
  category_field: "Category field",
  vat_rate: "VAT rate",
  unit: "Unit",
  location: "Place",
  setting: "Settings",
  inventory_item: "Item",
  stock_movement: "Movement",
  component_part: "Part",
  item_datasheet: "Data sheet",
};
const ACTION = { insert: "added", update: "changed", delete: "deleted" } as const;

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

const COLUMNS: Column<HistoryEntry>[] = [
  { key: "when", header: "WHEN", cell: (e) => dateTime(e.at), sort: (e) => e.at },
  { key: "who", header: "WHO", cell: (e) => e.actor?.name ?? <span className="muted">system</span>, sort: (e) => e.actor?.name ?? "system" },
  {
    key: "what",
    header: "WHAT",
    sort: (e) => `${TABLES[e.table] ?? e.table} ${ACTION[e.action]}`,
    cell: (e) => (
      <>
        <span className="bold">{TABLES[e.table] ?? e.table}</span> {ACTION[e.action]}
        {e.label && <div className="muted">{e.label}</div>}
      </>
    ),
  },
  { key: "details", header: "DETAILS", cell: (e) => <Changes entry={e} /> },
];

/** Everything that was changed, who did it and when (admins and project managers). Not designed in Figma yet. */
export function HistoryPage() {
  const allowed = useMe().permissions.canViewHistory;
  const [table, setTable] = useState("");
  const history = useInfiniteQuery({
    queryKey: ["history", table],
    queryFn: ({ pageParam }) => api.history({ table: table || undefined, before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: allowed,
  });

  if (!allowed) return <Message>The history is for admins and project managers.</Message>;

  return (
    <>
      <PageHeader
        title="History"
        description='Every change, newest first. Changes with no person (the first import, an account created at its first sign-in) show as "system".'
        actions={
          <Field label="Show" htmlFor="history-table">
            <select id="history-table" className="input small" value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">everything</option>
              {Object.entries(TABLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
        }
      />
      <Panel>
        <DataTable
          title="History"
          className="history"
          columns={COLUMNS}
          rows={history.isSuccess ? history.data.pages.flatMap((page) => page.entries) : undefined}
          rowKey={(e) => e.id}
          empty="No changes yet"
        />
        {history.hasNextPage && (
          <div>
            <Button variant="ghost" small disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
              Load older changes
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
