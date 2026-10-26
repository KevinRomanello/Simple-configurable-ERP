import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { ItemsView } from "../api/types";
import { DataTable, Field, PageHeader, Panel, type Column } from "../components/ui";
import { date, money } from "../lib/format";

type ItemLine = ItemsView["rows"][number];

const PRIORITY_OPTIONS = [
  ["all", "All priorities"],
  ["High", "High"],
  ["Medium", "Medium"],
  ["Low", "Low"],
] as const;

const bold = () => "bold";

const COLUMNS: Column<ItemLine>[] = [
  { key: "area", header: "AREA", sort: (r) => r.areaName, cellClass: bold, cell: (r) => r.areaName },
  { key: "project", header: "PROJECT", sort: (r) => r.projectName, cellClass: bold, cell: (r) => r.projectName },
  { key: "item", header: "ITEM", sort: (r) => r.item, cell: (r) => r.item },
  { key: "category", header: "CATEGORY", sort: (r) => r.category, cell: (r) => r.category },
  {
    key: "priority",
    header: "PRIORITY",
    sort: (r) => ({ High: 1, Medium: 2, Low: 3 })[r.priority as string] ?? null,
    cell: (r) => r.priority && <span className={`pill ${r.priority}`}>{r.priority}</span>,
  },
  { key: "estOutflow", header: "EXPECTED OUTFLOW", num: true, sort: (r) => r.estimate.outflowCents, cell: (r) => money(r.estimate.outflowCents) },
  { key: "estFund", header: "EXPECTED CASH FROM", sort: (r) => r.estimate.fundName, cell: (r) => r.estimate.fundName },
  { key: "estSupplier", header: "EXPECTED BOUGHT FROM", sort: (r) => r.estimate.supplierName, cell: (r) => r.estimate.supplierName },
  { key: "estDate", header: "EXPECTED BUY DATE", sort: (r) => r.estimate.purchaseDate, cell: (r) => date(r.estimate.purchaseDate) },
  { key: "actOutflow", header: "ACTUAL OUTFLOW", num: true, sort: (r) => r.actual.outflowCents, cell: (r) => money(r.actual.outflowCents) },
  { key: "actFund", header: "ACTUAL CASH FROM", sort: (r) => r.actual.fundName, cell: (r) => r.actual.fundName },
  { key: "actSupplier", header: "ACTUAL BOUGHT FROM", sort: (r) => r.actual.supplierName, cell: (r) => r.actual.supplierName },
  { key: "actDate", header: "ACTUAL BUY DATE", sort: (r) => r.actual.purchaseDate, cell: (r) => date(r.actual.purchaseDate) },
];

/** CATEGORY ANALYSES: a read-only list of the items, filtered by category and priority. */
export function ItemsPage() {
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<string>("all");

  const query = new URLSearchParams({ categories: selected.join(","), priority }).toString();
  const items = useQuery({ queryKey: ["items", query], queryFn: () => api.items(query) });

  const toggle = (category: string) =>
    setSelected((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));

  return (
    <>
      <PageHeader title="CATEGORY ANALYSES" description="Items without a category are not listed here." />

      <Panel>
        <div className="toggle-row" role="group" aria-label="Categories">
          <button type="button" className={`chip${selected.length === 0 ? " on" : ""}`} onClick={() => setSelected([])}>
            All Categories
          </button>
          {categories.data?.map((c) => (
            <button key={c} type="button" className={`chip${selected.includes(c) ? " on" : ""}`} aria-pressed={selected.includes(c)} onClick={() => toggle(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="inline-form">
          <Field label="Priority" htmlFor="priority">
            <select id="priority" className="input small" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </div>

        {/* the oldest expected buy date first, until a header is clicked */}
        <DataTable
          title="Category analyses"
          columns={COLUMNS}
          rows={items.data?.rows}
          rowKey={(r) => r.lineId}
          initialSort={{ key: "estDate", direction: 1 }}
          empty="No items found for the selected filters."
        />
      </Panel>
    </>
  );
}
