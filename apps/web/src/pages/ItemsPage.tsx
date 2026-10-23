import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { ItemsView } from "../api/types";
import { date, money } from "../lib/format";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

const PRIORITY_OPTIONS = [
  ["all", "All priorities"],
  ["High", "High"],
  ["Medium", "Medium"],
  ["Low", "Low"],
] as const;

const COLUMNS: SortAccessors<ItemsView["rows"][number]> = {
  area: (r) => r.areaName,
  project: (r) => r.projectName,
  item: (r) => r.item,
  category: (r) => r.category,
  priority: (r) => ({ High: 1, Medium: 2, Low: 3 })[r.priority as string] ?? null,
  estOutflow: (r) => r.estimate.outflowCents,
  estFund: (r) => r.estimate.fundName,
  estSupplier: (r) => r.estimate.supplierName,
  estDate: (r) => r.estimate.purchaseDate,
  actOutflow: (r) => r.actual.outflowCents,
  actFund: (r) => r.actual.fundName,
  actSupplier: (r) => r.actual.supplierName,
  actDate: (r) => r.actual.purchaseDate,
};

/** CATEGORY ANALYSES: a read-only list of the items, filtered by category and priority. */
export function ItemsPage() {
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<string>("all");
  // the oldest expected buy date first, until a header is clicked
  const byColumn = useSort(COLUMNS, { key: "estDate", direction: 1 });

  const query = new URLSearchParams({ categories: selected.join(","), priority }).toString();
  const items = useQuery({ queryKey: ["items", query], queryFn: () => api.items(query) });

  const toggle = (category: string) =>
    setSelected((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));

  const rows = byColumn.sorted(items.data?.rows ?? []);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>CATEGORY ANALYSES</h1>
          <p className="muted">Items without a category are not listed here.</p>
        </div>
        <DownloadMenu />
      </header>

      <section className="panel">
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
          <div className="field">
            <label htmlFor="priority">Priority</label>
            <select id="priority" className="input small" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        <TableBox title="Category analyses">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh sort={byColumn} by="area">AREA</SortTh>
                <SortTh sort={byColumn} by="project">PROJECT</SortTh>
                <SortTh sort={byColumn} by="item">ITEM</SortTh>
                <SortTh sort={byColumn} by="category">CATEGORY</SortTh>
                <SortTh sort={byColumn} by="priority">PRIORITY</SortTh>
                <SortTh sort={byColumn} by="estOutflow" className="num">EXPECTED OUTFLOW</SortTh>
                <SortTh sort={byColumn} by="estFund">EXPECTED CASH FROM</SortTh>
                <SortTh sort={byColumn} by="estSupplier">EXPECTED BOUGHT FROM</SortTh>
                <SortTh sort={byColumn} by="estDate">EXPECTED BUY DATE</SortTh>
                <SortTh sort={byColumn} by="actOutflow" className="num">ACTUAL OUTFLOW</SortTh>
                <SortTh sort={byColumn} by="actFund">ACTUAL CASH FROM</SortTh>
                <SortTh sort={byColumn} by="actSupplier">ACTUAL BOUGHT FROM</SortTh>
                <SortTh sort={byColumn} by="actDate">ACTUAL BUY DATE</SortTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.lineId}>
                  <td className="bold">{row.areaName}</td>
                  <td className="bold">{row.projectName}</td>
                  <td>{row.item}</td>
                  <td>{row.category}</td>
                  <td>{row.priority && <span className={`pill ${row.priority}`}>{row.priority}</span>}</td>
                  <td className="num">{money(row.estimate.outflowCents)}</td>
                  <td>{row.estimate.fundName}</td>
                  <td>{row.estimate.supplierName}</td>
                  <td>{date(row.estimate.purchaseDate)}</td>
                  <td className="num">{money(row.actual.outflowCents)}</td>
                  <td>{row.actual.fundName}</td>
                  <td>{row.actual.supplierName}</td>
                  <td>{date(row.actual.purchaseDate)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={13} className="empty">No items found for the selected filters.</td></tr>}
            </tbody>
          </table>
        </TableBox>
      </section>
    </>
  );
}
