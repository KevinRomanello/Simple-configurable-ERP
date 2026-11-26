import { faBoxOpen } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { api } from "../api/client";
import type { PendingRow } from "../api/types";
import { ArrivalPill } from "../components/ArrivalPill";
import { Button } from "../components/Button";
import { ReceiveForm } from "../components/ReceiveForm";
import { useMe } from "../lib/auth";
import { date, moneyE4, quantity } from "../lib/format";
import { useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";
import { TableBox } from "../components/ExportBlocks";
import { SortTh } from "../components/SortTh";
import { EmptyRow, PageHeader, Panel, RowAction, Table } from "../components/ui";
import { useSort, type SortAccessors } from "../lib/sort";

const SORT: SortAccessors<PendingRow> = {
  item: (r) => r.item,
  brand: (r) => r.brand,
  model: (r) => r.model,
  project: (r) => r.projectName,
  supplier: (r) => r.supplierName,
  bought: (r) => r.boughtMilli,
  arrived: (r) => r.receivedMilli,
  toArrive: (r) => r.remainingMilli,
  boughtOn: (r) => r.purchaseDate,
  waiting: (r) => r.daysWaiting,
  expected: (r) => r.expectedArrival,
  state: (r) => r.status,
};

/** PENDING: what the budget says was bought and has not arrived yet. When it does, it goes on the shelf from here. */
export function PendingPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const lookups = useInventoryLookups();
  const [price] = usePrice();
  const pending = useQuery({ queryKey: ["inventory-pending"], queryFn: api.pending });
  const items = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });
  const [open, setOpen] = useState<number | null>(null);
  const sort = useSort(SORT);
  const rows = sort.sorted(pending.data ?? []);

  return (
    <>
      <PageHeader
        title="PENDING"
        description="Purchases of the budget (the ACTUAL columns) that have not fully arrived. Receive what came, even in parts: the budget then shows it as arrived."
      />

      <Panel>
        <TableBox title="Pending" cards>
          <Table className="phone-cards">
            <thead>
              <tr>
                <SortTh sort={sort} by="item">ITEM</SortTh>
                <SortTh sort={sort} by="brand">BRAND</SortTh>
                <SortTh sort={sort} by="model">MODEL</SortTh>
                <SortTh sort={sort} by="project">PROJECT</SortTh>
                <SortTh sort={sort} by="supplier">BOUGHT FROM</SortTh>
                <SortTh sort={sort} by="bought" className="num">BOUGHT</SortTh>
                <SortTh sort={sort} by="arrived" className="num">ARRIVED</SortTh>
                <SortTh sort={sort} by="toArrive" className="num">TO ARRIVE</SortTh>
                <SortTh sort={sort} by="boughtOn">BOUGHT ON</SortTh>
                <SortTh sort={sort} by="waiting" className="num">WAITING</SortTh>
                <SortTh sort={sort} by="expected">EXPECTED</SortTh>
                <SortTh sort={sort} by="state">STATE</SortTh>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.lineId}>
                  <tr className={open === row.lineId ? "row-selected" : undefined}>
                    <td className="cell-title">{row.item}{row.category && <div className="muted">{row.category}</div>}</td>
                    <td>{row.brand ?? <span className="muted">—</span>}</td>
                    <td>{row.model ?? <span className="muted">—</span>}</td>
                    <td>{row.projectName}<div className="muted">{row.areaName}</div></td>
                    <td>{row.supplierName ?? <span className="muted">—</span>}</td>
                    <td className="num">{quantity(row.boughtMilli)}</td>
                    <td className="num">{quantity(row.receivedMilli)}</td>
                    <td className="num bold">{quantity(row.remainingMilli)}</td>
                    <td>{date(row.purchaseDate) || <span className="muted">no date</span>}</td>
                    <td className="num">{row.daysWaiting === null ? <span className="muted">—</span> : `${row.daysWaiting} d`}</td>
                    <td>{date(row.expectedArrival) || <span className="muted">—</span>}</td>
                    <td><ArrivalPill status={row.status} /></td>
                    <td className="num">
                      {canEdit && lookups && (
                        <Button small icon={faBoxOpen} onClick={() => setOpen(row.lineId)}>Receive</Button>
                      )}
                    </td>
                  </tr>
                  {open === row.lineId && lookups && items.data && (
                    <RowAction
                      colSpan={13}
                      eyebrow="Receive"
                      title={row.item}
                      context={[["Project", row.projectName], ["Bought from", row.supplierName ?? "—"], ["Bought", `${quantity(row.boughtMilli)} · arrived ${quantity(row.receivedMilli)}`], ["Per unit", `${moneyE4(row.prices.net)} net`]]}
                      onClose={() => setOpen(null)}
                    >
                      <ReceiveForm line={row} items={items.data} lookups={lookups} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />
                    </RowAction>
                  )}
                </Fragment>
              ))}
              {pending.isSuccess && rows.length === 0 && <EmptyRow colSpan={13}>Everything that was bought has arrived</EmptyRow>}
            </tbody>
          </Table>
        </TableBox>
        {rows.length > 0 && (
          <p className="muted">
            Prices per unit are the ones of the budget: {moneyE4(rows[0]?.prices.net)} net for the first line, for example. They are frozen on
            the shelf at the moment the goods arrive.
          </p>
        )}
      </Panel>
    </>
  );
}
