import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { treasuryBudgetApi } from "./api";
import type { PayableLine } from "./types";
import type { CashEntryRow } from "../../modules/treasury/public";
import { Button } from "../../core/Button";
import { FormActions, Info, Loading, Table, TableScroll } from "../../core/ui";
import { decimalText, money } from "../../core/format";
import { useAction } from "../../core/useAction";
import { useDraft } from "../../core/useDraft";
import { DraftNote } from "../../core/DraftNote";

/** What the panel needs of a payment: the register row, or a payment that pays no line yet. */
type Payment = Pick<CashEntryRow, "id" | "cents" | "lines">;

const SHOWN = 40;
const cents = (text: string) => Math.round(Number(text.replace(",", ".")) * 100) || 0;

/** A line of the list, with what the other payments paid of it. */
type Open = PayableLine & { others: number };

/** The lines of an order next to each other, where its first line was: the list shows them under the name of the order. */
function orderTogether(lines: Open[]): Open[] {
  const seen = new Set<number>();
  return lines.flatMap((l) => {
    if (l.orderId === null) return [l];
    if (seen.has(l.orderId)) return [];
    seen.add(l.orderId);
    return lines.filter((o) => o.orderId === l.orderId);
  });
}

/**
 * The lines of the budget a payment paid. The list is the ACTUAL lines that the team pays for (the net out of
 * its fund and the VAT), with what is paid of each; the boxes hold what THIS payment paid of a line (empty =
 * nothing). A payment covers the net first, then the VAT. A line can be paid in instalments by several
 * payments, and a payment can pay several lines. The lines of an order are together, under its name, and its
 * «Rest» fills them one after the other while the payment lasts (docs/registro-di-cassa.md, §5.4bis).
 */
export function PayLines({ entry, onClose }: { entry: Payment; onClose: () => void }) {
  const act = useAction();
  const lines = useQuery({ queryKey: ["payable-lines"], queryFn: treasuryBudgetApi.payableLines });
  const [initial] = useState<Record<number, string>>(() => Object.fromEntries(entry.lines.map((l) => [l.lineId, decimalText(l.cents, 2)])));
  // what is written is kept while it is typed; the lines the payment paid when it started are what the draft is checked against
  const [amounts, setAmounts, saved] = useDraft<Record<number, string>>(`pay-lines:${entry.id}`, initial, { base: JSON.stringify(initial) });
  const [text, setText] = useState("");
  if (!lines.data) return <Loading />;

  const mine = new Map(entry.lines.map((l) => [l.lineId, l.cents]));
  const listed = new Set(lines.data.map((l) => l.lineId));
  // what the other payments paid of a line: this one may pay the rest
  const all: Open[] = orderTogether(
    lines.data.map((l) => ({ ...l, others: l.paidCents - (mine.get(l.lineId) ?? 0) })).filter((l) => l.others < l.totalCents || mine.has(l.lineId)),
  );
  const wanted = text.trim().toLowerCase();
  const open = all.filter((l) => wanted === "" || `${l.item} ${l.project} ${l.orderName ?? ""}`.toLowerCase().includes(wanted));
  // only the lines of the list are written here; the part of the payment on lines that are not in it (of other seasons) counts once
  const amountOf = (lineId: number) => (listed.has(lineId) ? cents(amounts[lineId] ?? "") : 0);
  const total = lines.data.reduce((sum, l) => sum + amountOf(l.lineId), 0);
  const payment = -entry.cents;
  const elsewhere = entry.lines.filter((l) => !listed.has(l.lineId)).reduce((sum, l) => sum + l.cents, 0);
  const over = total + elsewhere > payment;
  /** What is left of the payment for these lines, after the lines that are not them. */
  const leftFor = (ids: number[]) => payment - elsewhere - lines.data.filter((l) => !ids.includes(l.lineId)).reduce((sum, l) => sum + amountOf(l.lineId), 0);
  // "Rest": what the line still needs, as far as what is left of the payment reaches
  const rest = (l: Open) => setAmounts({ ...amounts, [l.lineId]: decimalText(Math.max(0, Math.min(l.totalCents - l.others, leftFor([l.lineId]))), 2) });
  // "Rest" of an order: its lines one after the other, each with what it still needs, while the payment lasts
  const restOfOrder = (orderId: number) => {
    const inOrder = all.filter((l) => l.orderId === orderId);
    let left = leftFor(inOrder.map((l) => l.lineId));
    const next = { ...amounts };
    for (const l of inOrder) {
      const give = Math.max(0, Math.min(l.totalCents - l.others, left));
      left -= give;
      next[l.lineId] = give > 0 ? decimalText(give, 2) : "";
    }
    setAmounts(next);
  };

  const save = async () => {
    const chosen = lines.data.filter((l) => amountOf(l.lineId) > 0).map((l) => ({ lineId: l.lineId, amount: decimalText(amountOf(l.lineId), 2) }));
    if (await act(() => treasuryBudgetApi.setCashEntryLines(entry.id, chosen))) {
      saved.discard();
      onClose();
    }
  };

  const shown = open.slice(0, SHOWN);
  return (
    <div className="stack tight">
      <DraftNote draft={saved} />
      <div className="panel-title">
        <strong>Which lines of the budget this payment of {money(payment)} paid</strong>
        <Info label="About the lines of a payment">
          ACTUAL: what the team pays for them, the net out of its fund and the VAT; a payment covers the net first. A line with payments counts in the cash flow
          only what is still to pay.
        </Info>
      </div>
      {elsewhere > 0 && (
        <p className="hint warning">
          {money(elsewhere)} of it is on lines that are not in this list: saving keeps the ones of other seasons, and unties the ones the team no longer pays for.
        </p>
      )}
      <input className="input small" aria-label="Search lines" placeholder="Search a line, a project or an order" value={text} onChange={(e) => setText(e.target.value)} />
      <TableScroll>
        <Table>
          <thead>
            <tr><th>LINE</th><th>PROJECT</th><th className="num">TEAM PAYS</th><th className="num">PAID BY OTHERS</th><th className="num">THIS PAYMENT</th></tr>
          </thead>
          <tbody>
            {shown.map((l, i) => (
              <Fragment key={l.lineId}>
                {l.orderId !== null && shown[i - 1]?.orderId !== l.orderId && (
                  <tr className="order-row">
                    <td colSpan={4}>
                      <span className="bold">{l.orderName}</span>
                      <span className="muted"> · order of {all.filter((o) => o.orderId === l.orderId).length} lines</span>
                    </td>
                    <td className="num">
                      <Button small variant="ghost" title="Fill the lines of the order one after the other, while the payment lasts" onClick={() => restOfOrder(l.orderId!)}>Rest</Button>
                    </td>
                  </tr>
                )}
                <tr className={l.orderId === null ? undefined : "order-line"}>
                  <td className="cell-title">{l.item}</td>
                  <td>{l.project}</td>
                  <td className="num" title={`net ${money(l.teamFundCents)} + VAT ${money(l.teamVatCents)}`}>{money(l.totalCents)}</td>
                  <td className="num">{l.others > 0 ? money(l.others) : ""}</td>
                  <td className="num">
                    <input
                      className="input small"
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Paid of ${l.item}`}
                      placeholder="0,00"
                      value={amounts[l.lineId] ?? ""}
                      onChange={(e) => setAmounts({ ...amounts, [l.lineId]: e.target.value })}
                    />
                    <Button small variant="ghost" onClick={() => rest(l)}>Rest</Button>
                  </td>
                </tr>
              </Fragment>
            ))}
            {open.length === 0 && <tr><td colSpan={5} className="empty">No line to pay{text ? " matches" : ""}</td></tr>}
          </tbody>
        </Table>
      </TableScroll>
      {open.length > SHOWN && <p className="muted">{open.length - SHOWN} more lines: search to narrow them.</p>}
      <FormActions>
        <span className={over ? "hint error" : "muted"}>Paid on lines: {money(total + elsewhere)} of {money(payment)}</span>
        <Button small disabled={over} onClick={save}>Save</Button>
        <Button small variant="ghost" onClick={() => saved.leave(onClose)}>Cancel</Button>
      </FormActions>
    </div>
  );
}
