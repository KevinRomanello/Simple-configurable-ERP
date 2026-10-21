import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { StatsResult } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { PriceSelector } from "../components/PriceSelector";
import { money } from "../lib/format";
import { usePrice } from "../lib/price";
import { useSearchParams } from "react-router";

const BY: { value: StatsResult["by"]; label: string }[] = [
  { value: "project", label: "By project" },
  { value: "area", label: "By area" },
  { value: "category", label: "By category" },
  { value: "location", label: "By place" },
];

/** Which columns mean something for each cut: stock cannot be split by project, purchases cannot be split by place. */
const COLUMNS: Record<StatsResult["by"], { bought: boolean; pending: boolean; used: boolean; stock: boolean }> = {
  project: { bought: true, pending: true, used: true, stock: false },
  area: { bought: true, pending: true, used: true, stock: false },
  category: { bought: true, pending: true, used: true, stock: true },
  location: { bought: false, pending: false, used: false, stock: true },
};

/** INVENTORY STATS: what was bought, what is on its way, what was used and what is on the shelf, cut the way you need. */
export function InventoryStatsPage() {
  const [price, setPrice] = usePrice();
  const [params, setParams] = useSearchParams();
  const by = (BY.find((b) => b.value === params.get("by"))?.value ?? "project") as StatsResult["by"];
  const stats = useQuery({ queryKey: ["inventory-stats", by, price.basis], queryFn: () => api.inventoryStats(by, price.basis) });
  const rows = stats.data?.rows ?? [];
  const show = COLUMNS[by];
  const total = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((sum, r) => sum + pick(r), 0);

  const series = [
    ...(show.bought ? [{ key: "boughtCents", label: "Bought" }] : []),
    ...(show.pending ? [{ key: "pendingCents", label: "On its way" }] : []),
    ...(show.used ? [{ key: "usedCents", label: "Used" }] : []),
    ...(show.stock ? [{ key: "stockCents", label: "On the shelf" }] : []),
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>INVENTORY STATS</h1>
          <p className="muted">
            Bought is what has arrived, at the price of each arrival. On its way is what the budget bought and has not arrived. Used is what
            was taken from the shelf for a project, at the average price paid until then. On the shelf is valued at the average price paid.
          </p>
        </div>
      </header>

      <section className="panel">
        <Chips label="How to cut it" options={BY} value={by} onChange={(value) => setParams({ by: value, basis: price.basis }, { replace: true })} />
        <PriceSelector value={price} onChange={(change) => setPrice(change)} method={false} />

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{by.toUpperCase()}</th>
                <th className="num">ITEMS</th>
                {show.bought && <th className="num">BOUGHT</th>}
                {show.pending && <th className="num">ON ITS WAY</th>}
                {show.used && <th className="num">USED</th>}
                {show.stock && <th className="num">ON THE SHELF</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">{r.items || ""}</td>
                  {show.bought && <td className="num">{money(r.boughtCents, true)}</td>}
                  {show.pending && <td className="num">{money(r.pendingCents, true)}</td>}
                  {show.used && <td className="num">{money(r.usedCents, true)}</td>}
                  {show.stock && <td className="num">{money(r.stockCents, true)}</td>}
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="total">
                  <td>Total</td>
                  <td />
                  {show.bought && <td className="num">{money(total((r) => r.boughtCents))}</td>}
                  {show.pending && <td className="num">{money(total((r) => r.pendingCents))}</td>}
                  {show.used && <td className="num">{money(total((r) => r.usedCents))}</td>}
                  {show.stock && <td className="num">{money(total((r) => r.stockCents))}</td>}
                </tr>
              )}
              {stats.isSuccess && rows.length === 0 && <tr><td colSpan={6} className="empty">Nothing yet</td></tr>}
            </tbody>
          </table>
        </div>

        <BarsChart title={BY.find((b) => b.value === by)!.label} data={rows.map((r) => ({ ...r }))} xKey="label" series={series} height={280} />
      </section>
    </>
  );
}
