import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { api } from "../api/client";
import { date, money } from "../lib/format";

const PRIORITY_OPTIONS = [
  ["all", "All priorities"],
  ["High", "High"],
  ["Medium", "Medium"],
  ["Low", "Low"],
  ["high-to-low", "High → Low"],
  ["low-to-high", "Low → High"],
] as const;

const SORT_OPTIONS = [
  ["estimate-date", "Expected buy date (oldest first)"],
  ["actual-date", "Actual buy date (oldest first)"],
  ["area-project", "Area / Project A-Z"],
] as const;

/** CATEGORY ANALYSES: a read-only list of the items, filtered by category and priority. */
export function ItemsPage() {
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<string>("all");
  const [sort, setSort] = useState<string>("estimate-date");

  const query = new URLSearchParams({ categories: selected.join(","), priority, sort }).toString();
  const items = useQuery({ queryKey: ["items", query], queryFn: () => api.items(query) });

  const toggle = (category: string) =>
    setSelected((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));

  const rows = items.data?.rows ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>CATEGORY ANALYSES</h1>
          <p className="muted">Items without a category are not listed here.</p>
        </div>
      </header>

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
        <div className="field">
          <label htmlFor="sort">Sort</label>
          <select id="sort" className="input small" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>AREA</th><th>PROJECT</th><th>ITEM</th><th>CATEGORY</th><th>PRIORITY</th>
              <th className="num">EXPECTED OUTFLOW</th><th>EXPECTED CASH FROM</th><th>EXPECTED BOUGHT FROM</th><th>EXPECTED BUY DATE</th>
              <th className="num">ACTUAL OUTFLOW</th><th>ACTUAL CASH FROM</th><th>ACTUAL BOUGHT FROM</th><th>ACTUAL BUY DATE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={row.lineId}>
                {items.data?.groupedByArea && row.areaName !== rows[i - 1]?.areaName && (
                  <tr className="group"><td colSpan={13}>{row.areaName}</td></tr>
                )}
                <tr>
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
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={13} className="empty">No items found for the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
