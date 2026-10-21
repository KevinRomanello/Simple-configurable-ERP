import { faBoxOpen } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { api } from "../api/client";
import { ArrivalPill } from "../components/ArrivalPill";
import { Button } from "../components/Button";
import { ReceiveForm } from "../components/ReceiveForm";
import { useMe } from "../lib/auth";
import { date, moneyE4, quantity } from "../lib/format";
import { useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";

/** PENDING: what the budget says was bought and has not arrived yet. When it does, it goes on the shelf from here. */
export function PendingPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const lookups = useInventoryLookups();
  const [price] = usePrice();
  const pending = useQuery({ queryKey: ["inventory-pending"], queryFn: api.pending });
  const items = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });
  const [open, setOpen] = useState<number | null>(null);
  const rows = pending.data ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>PENDING</h1>
          <p className="muted">
            Purchases of the budget (the ACTUAL columns) that have not fully arrived. Receive what came, even in parts: the budget then
            shows it as arrived.
          </p>
        </div>
      </header>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ITEM</th>
              <th>PROJECT</th>
              <th>BOUGHT FROM</th>
              <th className="num">BOUGHT</th>
              <th className="num">ARRIVED</th>
              <th className="num">TO ARRIVE</th>
              <th>BOUGHT ON</th>
              <th className="num">WAITING</th>
              <th>EXPECTED</th>
              <th>STATE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.lineId}>
                <tr>
                  <td>{row.item}{row.category && <div className="muted">{row.category}</div>}</td>
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
                      <Button small icon={faBoxOpen} variant={open === row.lineId ? "ghost" : "primary"} onClick={() => setOpen(open === row.lineId ? null : row.lineId)}>
                        {open === row.lineId ? "Close" : "Receive"}
                      </Button>
                    )}
                  </td>
                </tr>
                {open === row.lineId && lookups && items.data && (
                  <tr className="row-panel">
                    <td colSpan={11}>
                      <ReceiveForm line={row} items={items.data} lookups={lookups} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {pending.isSuccess && rows.length === 0 && <tr><td colSpan={11} className="empty">Everything that was bought has arrived</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <p className="muted">
          Prices per unit are the ones of the budget: {moneyE4(rows[0]?.prices.net)} net for the first line, for example. They are frozen on
          the shelf at the moment the goods arrive.
        </p>
      )}
    </>
  );
}
