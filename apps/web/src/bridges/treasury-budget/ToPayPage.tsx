import { faChevronDown, faLayerGroup, faMoneyBillWave, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { treasuryBudgetApi } from "./api";
import type { ToLinkRow, ToPayRow } from "./types";
import type { ToPayStatus } from "../../core/calcTypes";
import { Button } from "../../core/Button";
import { EditCell } from "../../core/EditCell";
import { TableBox } from "../../core/ExportBlocks";
import { AddToOrder, NewOrder } from "./OrderForms";
import { PayForm } from "./PayForm";
import { PayLines } from "./PayLines";
import { isOrder, SORT, toPayEntries, type OrderRow } from "./toPayOrders";
import { SortTh } from "../../core/SortTh";
import { EmptyRow, Field, Loading, Message, PageHeader, Panel, RowAction, Table } from "../../core/ui";
import { useMe } from "../../platform/auth";
import { date, money } from "../../core/format";
import { useAction } from "../../core/useAction";
import { useSort } from "../../core/sort";
import { useRemembered } from "../../core/useDraft";

const STATUS: Record<ToPayStatus, { label: string; pill: string }> = {
  due: { label: "To pay", pill: "arrival-ordered" },
  planned: { label: "Planned", pill: "teal" },
  partial: { label: "Part paid", pill: "arrival-partial" },
  over: { label: "Overpaid", pill: "arrival-over" },
};

/** What is being paid: one line, the lines of an order (its Pay button), or the ticked ones. */
interface Paying {
  lineIds: number[];
  orderId: number | null;
}
/** The ticked lines being grouped: into a new order, or into one already there. */
interface Grouping {
  how: "new" | "add";
  lineIds: number[];
}

const sumDue = (rows: ToPayRow[]) => rows.reduce((sum, r) => sum + r.dueCents, 0);
const lineCount = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

/**
 * TO PAY: what the budget says was bought (the ACTUAL columns) and the team has not paid yet: the net out of its fund and the VAT it
 * owes. Who keeps the budget sees it and groups the lines bought in one order (a user only the lines of their areas): an order is one
 * row that opens to show its lines. The treasury and the admins pay: "Pay" makes the payment in the register, tied to the lines, for
 * a line, an order or the ticked lines; under the table, the payments of the register that pay no line yet. docs/registro-di-cassa.md
 */
export function ToPayPage() {
  const { canManageCash, canSeeToPay, canGroupOrders } = useMe().permissions;
  const act = useAction();
  const [allSeasons, setAllSeasons] = useState(false);
  const [text, setText] = useState("");
  // what the panels are for, remembered with their forms: coming back to the page the panel is open with what was written
  const [paying, setPaying] = useRemembered<Paying | null>("to-pay:pay", null, (p) => (p ? `pay:${p.lineIds.join(",")}` : null));
  const [grouping, setGrouping] = useRemembered<Grouping | null>("to-pay:grouping", null, (g) => (g ? `order:${g.how}` : null));
  const [picked, setPicked] = useState<number[]>([]);
  const [opened, setOpened] = useState<number[]>([]);
  const toPay = useQuery({ queryKey: ["to-pay", allSeasons], queryFn: () => treasuryBudgetApi.toPay(allSeasons), enabled: canSeeToPay });
  const sort = useSort(SORT);

  if (!canSeeToPay) return <Message>Only who keeps the budget can see what is to pay.</Message>;
  if (!toPay.data) return <Loading />;
  const { rows: all, orders, lastMethodId } = toPay.data;
  const entries = toPayEntries(all, orders, text, sort.state);
  const listed = entries.flatMap((e) => (isOrder(e) ? e.lines : [e]));
  const chosen = all.filter((r) => picked.includes(r.lineId));
  /** The ids of these lines in the order the server gave them: the key of the draft of their payment does not change with the sorting. */
  const ids = (lines: ToPayRow[]) => all.filter((r) => lines.some((l) => l.lineId === r.lineId)).map((r) => r.lineId);

  const mayPay = (r: ToPayRow) => canManageCash && r.dueCents > 0;
  const mayGroup = (r: ToPayRow) => canGroupOrders && r.canGroup;
  const tick = (lineIds: number[], on: boolean) => setPicked((now) => (on ? [...new Set([...now, ...lineIds])] : now.filter((id) => !lineIds.includes(id))));
  const done = () => {
    setPaying(null);
    setGrouping(null);
    setPicked([]);
  };
  const pay = (lines: ToPayRow[], orderId: number | null = null) => setPaying({ lineIds: ids(lines), orderId });
  const payingLine = paying && paying.orderId === null && paying.lineIds.length === 1 ? paying.lineIds[0]! : null;
  const payRows = all.filter((r) => paying?.lineIds.includes(r.lineId));
  const payOrder = paying?.orderId == null ? undefined : orders.find((o) => o.id === paying.orderId);

  // the ticked lines can be grouped when the person may group each of them and they are of one season (an order is of one season)
  const groupable = chosen.length > 0 && chosen.every(mayGroup) && new Set(chosen.map((r) => r.seasonId)).size === 1;
  const ordersToJoin = groupable ? orders.filter((o) => o.seasonId === chosen[0]!.seasonId && chosen.some((r) => r.orderId !== o.id)) : [];
  const groupRows = all.filter((r) => grouping?.lineIds.includes(r.lineId));

  /** The panel that pays: under the row of the line or of the order, or loose when the ticked lines are paid together. */
  const payAction = () => {
    const one = !payOrder && payRows.length === 1 ? payRows[0]! : null;
    const context: [string, string][] = one
      ? [["Project", one.projectName], ["Bought from", one.supplierName ?? "—"], ["To pay", money(one.dueCents)]]
      : [["Lines", String(payRows.length)], ["To pay", money(sumDue(payRows))]];
    return (
      <RowAction
        colSpan={one || payOrder ? 10 : undefined}
        loose={!one && !payOrder}
        eyebrow="Pay"
        title={payOrder ? `order ${payOrder.name}` : one ? one.item : `${payRows.length} lines in one payment`}
        context={context}
        quick={one ? <PayForm key={`quick-${one.lineId}`} rows={payRows} lastMethodId={lastMethodId} compact onDone={done} /> : undefined}
        onClose={done}
      >
        <PayForm key={payRows.map((r) => r.lineId).join(",")} rows={payRows} order={payOrder?.name} lastMethodId={lastMethodId} onDone={done} />
      </RowAction>
    );
  };
  const takeOut = (row: ToPayRow) => void act(() => treasuryBudgetApi.updateOrder(row.orderId!, { removeLineIds: [row.lineId] }));
  const ungroup = (order: OrderRow) => {
    if (window.confirm(`Ungroup the order "${order.item}"? Its lines stay in TO PAY, each on its own.`)) void act(() => treasuryBudgetApi.deleteOrder(order.orderId));
  };
  const rename = (order: OrderRow, name: string) => name !== "" && void act(() => treasuryBudgetApi.updateOrder(order.orderId, { name }));
  // an order is open when it was opened, or when one of its lines is being paid (coming back to the page, its panel shows)
  const isOpen = (order: OrderRow) => opened.includes(order.orderId) || order.lines.some((l) => l.lineId === payingLine);
  const toggleOpen = (order: OrderRow) => setOpened(isOpen(order) ? opened.filter((id) => id !== order.orderId) : [...opened, order.orderId]);

  const lineRow = (row: ToPayRow, inOrder: boolean) => (
    <Fragment key={row.lineId}>
      <tr className={[inOrder ? "order-line" : "", payingLine === row.lineId ? "row-selected" : ""].filter(Boolean).join(" ") || undefined}>
        <td><input type="checkbox" aria-label={`Tick ${row.item}`} checked={picked.includes(row.lineId)} disabled={!mayPay(row) && !mayGroup(row)} onChange={(e) => tick([row.lineId], e.target.checked)} /></td>
        <td className="cell-title">{row.item}{row.category && <div className="muted">{row.category}</div>}</td>
        <td>{row.projectName}<div className="muted">{row.areaName}{allSeasons ? ` · ${row.seasonName}` : ""}</div></td>
        <td>{row.supplierName ?? <span className="muted">—</span>}</td>
        <td>{date(row.purchaseDate) || <span className="muted">no date</span>}</td>
        <td className="num">{row.daysWaiting === null ? <span className="muted">—</span> : `${row.daysWaiting} d`}</td>
        <td className="num">
          {row.status === "over" ? <span className="bold">+{money(row.overpaidCents)}</span> : <span className="bold">{money(row.dueCents)}</span>}
          {row.unpaidVatCents > 0 && row.dueCents > row.unpaidVatCents && (
            <div className="muted">net {money(row.unpaidFundCents)} + VAT {money(row.unpaidVatCents)}</div>
          )}
          {row.unpaidVatCents > 0 && row.dueCents === row.unpaidVatCents && (
            <div className="muted">VAT{row.vatDueDate ? ` on ${date(row.vatDueDate)}` : ""}</div>
          )}
        </td>
        <td className="num">{row.paidCents > 0 ? money(row.paidCents) : <span className="muted">—</span>}</td>
        <td><span className={`pill ${STATUS[row.status].pill}`}>{STATUS[row.status].label}</span></td>
        <td className="num">
          <span className="cell-buttons">
            {inOrder && mayGroup(row) && <Button small variant="ghost" title="Take the line out of the order: it stays in TO PAY on its own" onClick={() => takeOut(row)}>Take out</Button>}
            {mayPay(row) && <Button small icon={faMoneyBillWave} onClick={() => pay([row])}>Pay</Button>}
          </span>
        </td>
      </tr>
      {payingLine === row.lineId && payAction()}
    </Fragment>
  );

  const orderRows = (order: OrderRow) => {
    const open = isOpen(order);
    const tickable = order.lines.filter((l) => mayPay(l) || mayGroup(l)).map((l) => l.lineId);
    const payable = order.lines.filter(mayPay);
    const changes = canGroupOrders && order.canChange;
    return (
      <Fragment key={`order-${order.orderId}`}>
        <tr className={`order-row${payOrder?.id === order.orderId ? " row-selected" : ""}`}>
          <td>
            <input
              type="checkbox"
              aria-label={`Tick the lines of the order ${order.item}`}
              checked={tickable.length > 0 && tickable.every((id) => picked.includes(id))}
              disabled={tickable.length === 0}
              onChange={(e) => tick(tickable, e.target.checked)}
            />
          </td>
          <td className="cell-title">
            <span className="order-title">
              <button type="button" className="icon-btn" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} the order ${order.item}`} onClick={() => toggleOpen(order)}>
                <FontAwesomeIcon icon={faChevronDown} className={`row-chevron${open ? "" : " shut"}`} />
              </button>
              <span>
                {changes ? <EditCell kind="text" value={order.item} label={`the name of the order ${order.item}`} onCommit={(name) => rename(order, name)} /> : order.item}
                <div className="muted">Order · {lineCount(order.lines.length)}</div>
              </span>
            </span>
          </td>
          <td>{order.projectName ?? `${order.projects.length} projects`}<div className="muted">{order.areas.join(", ")}{allSeasons ? ` · ${order.seasonName}` : ""}</div></td>
          <td>
            {order.supplierName ?? (order.suppliers.length > 1 ? <>several<div className="muted">{order.suppliers.join(", ")}</div></> : <span className="muted">—</span>)}
          </td>
          <td>{date(order.purchaseDate) || <span className="muted">no date</span>}</td>
          <td className="num">{order.daysWaiting === null ? <span className="muted">—</span> : `${order.daysWaiting} d`}</td>
          <td className="num">
            <span className="bold">{money(order.dueCents)}</span>
            {order.overpaidCents > 0 && <div className="muted">+{money(order.overpaidCents)} overpaid</div>}
          </td>
          <td className="num">{order.paidCents > 0 ? money(order.paidCents) : <span className="muted">—</span>}</td>
          <td><span className={`pill ${STATUS[order.status].pill}`}>{STATUS[order.status].label}</span></td>
          <td className="num">
            <span className="cell-buttons">
              {changes && <Button small variant="ghost" onClick={() => ungroup(order)}>Ungroup</Button>}
              {payable.length > 0 && <Button small icon={faMoneyBillWave} onClick={() => pay(payable, order.orderId)}>Pay</Button>}
            </span>
          </td>
        </tr>
        {payOrder?.id === order.orderId && payAction()}
        {open && order.lines.map((line) => lineRow(line, true))}
      </Fragment>
    );
  };

  return (
    <>
      <PageHeader
        title="TO PAY"
        description={
          canManageCash
            ? "The purchases of the budget (the ACTUAL columns) that the team has not paid yet: the net out of its fund and the VAT. Pay makes the payment in the register, tied to the lines; tick several lines to pay them with one payment, or to group the lines bought in one order. The budget then shows them as paid."
            : "The purchases of the budget (the ACTUAL columns) that the team has not paid yet: the net out of its fund and the VAT. Tick the lines bought in one order to group them; the treasury pays them."
        }
        actions={
          <>
            <Field label="Search" htmlFor="to-pay-search">
              <input id="to-pay-search" className="input small" placeholder="Line, project, supplier, order" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={allSeasons} onChange={(e) => setAllSeasons(e.target.checked)} />
              All seasons
            </label>
            {groupable && chosen.length > 1 && (
              <Button icon={faLayerGroup} variant="ghost" onClick={() => setGrouping({ how: "new", lineIds: ids(chosen) })}>Group as one order</Button>
            )}
            {ordersToJoin.length > 0 && (
              <Button icon={faPlus} variant="ghost" onClick={() => setGrouping({ how: "add", lineIds: ids(chosen) })}>Add to order…</Button>
            )}
            {chosen.length > 1 && chosen.every(mayPay) && (
              <Button icon={faMoneyBillWave} onClick={() => pay(chosen)}>Pay the {chosen.length} ticked</Button>
            )}
          </>
        }
      />

      {paying && !payingLine && !payOrder && payRows.length > 0 && payAction()}
      {grouping && groupRows.length > 0 && (
        <RowAction loose eyebrow={grouping.how === "new" ? "Group as one order" : "Add to order"} title={lineCount(groupRows.length)} context={[["Lines", groupRows.map((r) => r.item).join(", ")]]} onClose={done}>
          {grouping.how === "new" ? (
            <NewOrder rows={groupRows} onDone={done} />
          ) : (
            <AddToOrder rows={groupRows} orders={orders.filter((o) => o.seasonId === groupRows[0]!.seasonId)} onDone={done} />
          )}
        </RowAction>
      )}

      <Panel>
        <TableBox title="To pay" cards>
          <Table className="phone-cards">
            <thead>
              <tr>
                <th />
                <SortTh sort={sort} by="item">LINE</SortTh>
                <SortTh sort={sort} by="project">PROJECT</SortTh>
                <SortTh sort={sort} by="supplier">BOUGHT FROM</SortTh>
                <SortTh sort={sort} by="boughtOn">BOUGHT ON</SortTh>
                <SortTh sort={sort} by="waiting" className="num">WAITING</SortTh>
                <SortTh sort={sort} by="due" className="num">TO PAY</SortTh>
                <SortTh sort={sort} by="paid" className="num">PAID</SortTh>
                <SortTh sort={sort} by="state">STATE</SortTh>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (isOrder(entry) ? orderRows(entry) : lineRow(entry, false)))}
              {entries.length === 0 && <EmptyRow colSpan={10}>{all.length === 0 ? "Everything that was bought has been paid" : "No line matches the search"}</EmptyRow>}
            </tbody>
          </Table>
        </TableBox>
        {listed.length > 0 && <p className="muted">Left to pay in this list: {money(sumDue(listed))}. A payment covers the net first and then the VAT.</p>}
      </Panel>

      {canManageCash && <ToLink />}
    </>
  );
}

/** The payments of the register (of the season) that pay no line of the budget: tie them to the lines they paid. */
function ToLink() {
  const list = useQuery({ queryKey: ["to-link"], queryFn: treasuryBudgetApi.toLink });
  const [linking, setLinking] = useRemembered<number | null>("to-pay:linking", null, (id) => (id === null ? null : `pay-lines:${id}`));
  const [open, setOpen] = useState(linking !== null);
  if (!list.data) return null;
  const rows: ToLinkRow[] = list.data;

  return (
    <Panel title={`Payments to tie to a line (${rows.length})`}>
      <p className="muted">
        Payments of the register that do not pay any line of the budget yet: the ones made by hand or loaded from the sheet. Tie each one to the lines it
        paid, and they are no longer owed here. Only the Voci that are spent on a project are here: the ones outside the budget (a stamp duty) are in the
        area ADMINISTRATION, and the ones the budget ignores (VAT) are nobody&apos;s.
      </p>
      <Button small variant="ghost" onClick={() => setOpen(!open)}>{open ? "Hide the list" : "Show the list"}</Button>
      {open && (
        <TableBox title="Payments to tie" cards>
          <Table className="phone-cards">
            <thead>
              <tr><th>DATE</th><th>DESCRIPTION</th><th>ACCOUNT</th><th className="num">AMOUNT</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <Fragment key={e.id}>
                  <tr className={linking === e.id ? "row-selected" : undefined}>
                    <td>{date(e.on)}</td>
                    <td className="cell-title">{e.description}</td>
                    <td>{e.account === "cash" ? "CASSA" : e.account === "bank" ? "BANCA" : "PAYPAL"}</td>
                    <td className="num">{money(-e.cents)}</td>
                    <td className="num">
                      <Button small onClick={() => setLinking(e.id)}>Link to lines</Button>
                    </td>
                  </tr>
                  {linking === e.id && (
                    <RowAction
                      colSpan={5}
                      eyebrow="Link to lines"
                      title={e.description || "this payment"}
                      context={[["Date", date(e.on)], ["Account", e.account === "cash" ? "CASSA" : e.account === "bank" ? "BANCA" : "PAYPAL"], ["Paid", money(-e.cents)]]}
                      onClose={() => setLinking(null)}
                    >
                      <PayLines entry={e} onClose={() => setLinking(null)} />
                    </RowAction>
                  )}
                </Fragment>
              ))}
              {rows.length === 0 && <EmptyRow colSpan={5}>Every payment of this season pays a line</EmptyRow>}
            </tbody>
          </Table>
        </TableBox>
      )}
    </Panel>
  );
}
