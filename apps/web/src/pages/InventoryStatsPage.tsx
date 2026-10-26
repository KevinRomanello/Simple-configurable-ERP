import type { StatsRow } from "@erp/calc";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import type { StatsResult } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Chips } from "../components/Chips";
import { PriceSelector } from "../components/PriceSelector";
import { DataTable, PageHeader, Panel, type Column } from "../components/ui";
import { money } from "../lib/format";
import { usePrice } from "../lib/price";

const BY: { value: StatsResult["by"]; label: string }[] = [
  { value: "project", label: "By project" },
  { value: "area", label: "By area" },
  { value: "category", label: "By category" },
  { value: "location", label: "By place" },
];

type Amount = "boughtCents" | "pendingCents" | "usedCents" | "stockCents";

/** The amounts, in the order of the table; which of them mean something depends on the cut (below). */
const AMOUNTS: { key: Amount; header: string; series: string }[] = [
  { key: "boughtCents", header: "BOUGHT", series: "Bought" },
  { key: "pendingCents", header: "ON ITS WAY", series: "On its way" },
  { key: "usedCents", header: "USED", series: "Used" },
  { key: "stockCents", header: "ON THE SHELF", series: "On the shelf" },
];

/** Which amounts mean something for each cut: stock cannot be split by project, purchases cannot be split by place. */
const SHOWN: Record<StatsResult["by"], Amount[]> = {
  project: ["boughtCents", "pendingCents", "usedCents"],
  area: ["boughtCents", "pendingCents", "usedCents"],
  category: ["boughtCents", "pendingCents", "usedCents", "stockCents"],
  location: ["stockCents"],
};

/** INVENTORY STATS: what was bought, what is on its way, what was used and what is on the shelf, cut the way you need. */
export function InventoryStatsPage() {
  const [price, setPrice] = usePrice();
  const [params, setParams] = useSearchParams();
  const by = (BY.find((b) => b.value === params.get("by"))?.value ?? "project") as StatsResult["by"];
  const stats = useQuery({ queryKey: ["inventory-stats", by, price.basis], queryFn: () => api.inventoryStats(by, price.basis) });
  const rows = stats.data?.rows ?? [];
  const amounts = AMOUNTS.filter((a) => SHOWN[by].includes(a.key));
  const total = (key: Amount) => rows.reduce((sum, r) => sum + r[key], 0);
  const label = BY.find((b) => b.value === by)!.label;

  const columns: Column<StatsRow>[] = [
    { key: "label", header: by.toUpperCase(), sort: (r) => r.label, cell: (r) => r.label },
    { key: "items", header: "ITEMS", num: true, sort: (r) => r.items, cell: (r) => r.items || "" },
    ...amounts.map((a): Column<StatsRow> => ({ key: a.key, header: a.header, num: true, sort: (r) => r[a.key], cell: (r) => money(r[a.key], true) })),
  ];

  return (
    <>
      <PageHeader
        title="INVENTORY STATS"
        description="Bought is what has arrived, at the price of each arrival. On its way is what the budget bought and has not arrived. Used is what was taken from the shelf for a project, at the average price paid until then. On the shelf is valued at the average price paid."
      />

      <Panel>
        <Chips label="How to cut it" options={BY} value={by} onChange={(value) => setParams({ by: value, basis: price.basis }, { replace: true })} />
        <PriceSelector value={price} onChange={(change) => setPrice(change)} method={false} />

        <DataTable
          title={`Stats ${label.toLowerCase()}`}
          columns={columns}
          rows={stats.data?.rows}
          rowKey={(r) => r.key}
          empty="Nothing yet"
          footer={
            rows.length > 0 && (
              <tr className="total">
                <td>Total</td>
                <td />
                {amounts.map((a) => <td key={a.key} className="num">{money(total(a.key))}</td>)}
              </tr>
            )
          }
        />

        <BarsChart title={label} data={rows.map((r) => ({ ...r }))} xKey="label" series={amounts.map((a) => ({ key: a.key, label: a.series }))} height={280} />
      </Panel>
    </>
  );
}
