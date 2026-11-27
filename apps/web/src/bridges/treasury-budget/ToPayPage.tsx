import { faMoneyBillWave } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { treasuryBudgetApi } from "./api";
import type { ToLinkRow, ToPayRow } from "./types";
import type { ToPayStatus } from "../../core/calcTypes";
import { Button } from "../../core/Button";
import { TableBox } from "../../core/ExportBlocks";
import { PayForm } from "./PayForm";
import { PayLines } from "./PayLines";
import { SortTh } from "../../core/SortTh";
import { EmptyRow, Field, Loading, Message, PageHeader, Panel, RowAction, Table } from "../../core/ui";
import { useMe } from "../../platform/auth";
import { date, money } from "../../core/format";
import { useSort, type SortAccessors } from "../../core/sort";
import { useRemembered } from "../../core/useDraft";

const SORT: SortAccessors<ToPayRow> = {
  item: (r) => r.item,
  project: (r) => r.projectName,
  supplier: (r) => r.supplierName,
  boughtOn: (r) => r.purchaseDate,
  waiting: (r) => r.daysWaiting,
  due: (r) => r.dueCents,
  paid: (r) => r.paidCents,
  state: (r) => r.status,
};

const STATUS: Record<ToPayStatus, { label: string; pill: string }> = {
  due: { label: "To pay", pill: "arrival-ordered" },
  planned: { label: "Planned", pill: "teal" },
  partial: { label: "Part paid", pill: "arrival-partial" },
  over: { label: "Overpaid", pill: "arrival-over" },
};

/**
 * TO PAY: what the budget says was bought (the ACTUAL columns) and the team has not paid yet: the net out of its
 * fund and the VAT it owes. "Pay" makes the payment in the register, tied to the line, from here; several lines can
 * be paid in one go. Under the table, the payments of the register that pay no line yet. It is the copy of
 * PENDING for the treasury. docs/registro-di-cassa.md
 */
export function ToPayPage() {
  const { canManageCash } = useMe().permissions;
  const [allSeasons, setAllSeasons] = useState(false);
  const [text, setText] = useState("");
  // the lines the panel pays: one (its Pay button, the panel opens under its row) or the ticked ones (it belongs to no row)
  // (remembered with its form: coming back to the page the panel is open with what was written)
  const [paying, setPaying] = useRemembered<number[] | null>("to-pay:paying", null, (ids) => (ids ? `pay:${ids.join(",")}` : null));
  const [picked, setPicked] = useState<number[]>([]);
  const toPay = useQuery({ queryKey: ["to-pay", allSeasons], queryFn: () => treasuryBudgetApi.toPay(allSeasons), enabled: canManageCash });
  const sort = useSort(SORT);

  if (!canManageCash) return <Message>Only the treasury and the admins can see what is to pay.</Message>;
  if (!toPay.data) return <Loading />;
  const { rows: all, lastMethodId } = toPay.data;
  const rows = sort.sorted(all.filter((r) => text === "" || `${r.item} ${r.projectName} ${r.supplierName ?? ""}`.toLowerCase().includes(text.toLowerCase())));
  const chosen = all.filter((r) => picked.includes(r.lineId));
  const left = rows.reduce((sum, r) => sum + r.dueCents, 0);
  const toggle = (lineId: number) => setPicked((now) => (now.includes(lineId) ? now.filter((id) => id !== lineId) : [...now, lineId]));
  const done = () => {
    setPaying(null);
    setPicked([]);
  };
  const paid = all.filter((r) => paying?.includes(r.lineId));
  /** The panel that pays `lines`: under the row of the one line, or loose when several are paid together. */
  const payAction = (lines: ToPayRow[]) => {
    const one = lines.length === 1 ? lines[0]! : null;
    const context: [string, string][] = one
      ? [["Project", one.projectName], ["Bought from", one.supplierName ?? "—"], ["To pay", money(one.dueCents)]]
      : [["Lines", String(lines.length)], ["To pay", money(lines.reduce((sum, r) => sum + r.dueCents, 0))]];
    return (
      <RowAction
        colSpan={one ? 10 : undefined}
        loose={!one}
        eyebrow="Pay"
        title={one ? one.item : `${lines.length} lines in one payment`}
        context={context}
        quick={one ? <PayForm key={`quick-${one.lineId}`} rows={lines} lastMethodId={lastMethodId} compact onDone={done} /> : undefined}
        onClose={done}
      >
        <PayForm key={lines.map((r) => r.lineId).join(",")} rows={lines} lastMethodId={lastMethodId} onDone={done} />
      </RowAction>
    );
  };

  return (
    <>
      <PageHeader
        title="TO PAY"
        description="The purchases of the budget (the ACTUAL columns) that the team has not paid yet: the net out of its fund and the VAT. Pay makes the payment in the register, tied to the line; tick several lines to pay them with one payment. The budget then shows them as paid."
        actions={
          <>
            <Field label="Search" htmlFor="to-pay-search">
              <input id="to-pay-search" className="input small" placeholder="Line, project, supplier" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={allSeasons} onChange={(e) => setAllSeasons(e.target.checked)} />
              All seasons
            </label>
            {chosen.length > 1 && (
              <Button icon={faMoneyBillWave} onClick={() => setPaying(chosen.map((r) => r.lineId))}>Pay the {chosen.length} ticked</Button>
            )}
          </>
        }
      />

      {paid.length > 1 && payAction(paid)}

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
              {rows.map((row) => (
                <Fragment key={row.lineId}>
                  <tr className={paid.length === 1 && paid[0]!.lineId === row.lineId ? "row-selected" : undefined}>
                    <td><input type="checkbox" aria-label={`Tick ${row.item}`} checked={picked.includes(row.lineId)} disabled={row.dueCents <= 0} onChange={() => toggle(row.lineId)} /></td>
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
                      {row.dueCents > 0 && (
                        <Button small icon={faMoneyBillWave} onClick={() => setPaying([row.lineId])}>Pay</Button>
                      )}
                    </td>
                  </tr>
                  {paid.length === 1 && paid[0]!.lineId === row.lineId && payAction(paid)}
                </Fragment>
              ))}
              {rows.length === 0 && <EmptyRow colSpan={10}>{all.length === 0 ? "Everything that was bought has been paid" : "No line matches the search"}</EmptyRow>}
            </tbody>
          </Table>
        </TableBox>
        {rows.length > 0 && <p className="muted">Left to pay in this list: {money(left)}. A payment covers the net first and then the VAT.</p>}
      </Panel>

      <ToLink />
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
