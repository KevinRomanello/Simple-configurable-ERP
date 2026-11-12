import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { CashEntryRow } from "../api/types";

/** What the panel needs of a payment: the register row, or a payment that pays no line yet. */
type Payment = Pick<CashEntryRow, "id" | "cents" | "lines">;
import { Button } from "./Button";
import { Loading } from "./ui";
import { money } from "../lib/format";
import { decimalText } from "../lib/lineEdit";
import { useAction } from "../lib/useAction";

const SHOWN = 40;
const cents = (text: string) => Math.round(Number(text.replace(",", ".")) * 100) || 0;

/**
 * The lines of the budget a payment paid. The list is the ACTUAL lines that the team pays for (the net out of
 * its fund and the VAT), with what is paid of each; the boxes hold what THIS payment paid of a line (empty =
 * nothing). A payment covers the net first, then the VAT. A line can be paid in instalments by several
 * payments, and a payment can pay several lines.
 */
export function PayLines({ entry, onClose }: { entry: Payment; onClose: () => void }) {
  const act = useAction();
  const lines = useQuery({ queryKey: ["payable-lines"], queryFn: api.payableLines });
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(entry.lines.map((l) => [l.lineId, decimalText(l.cents, 2)])),
  );
  const [text, setText] = useState("");
  if (!lines.data) return <Loading />;

  const mine = new Map(entry.lines.map((l) => [l.lineId, l.cents]));
  // what the other payments paid of a line: this one may pay the rest
  const open = lines.data
    .map((l) => ({ ...l, others: l.paidCents - (mine.get(l.lineId) ?? 0) }))
    .filter((l) => l.others < l.totalCents || mine.has(l.lineId))
    .filter((l) => text === "" || `${l.item} ${l.project}`.toLowerCase().includes(text.toLowerCase()));
  const total = Object.values(amounts).reduce((sum, a) => sum + cents(a), 0);
  const payment = -entry.cents;
  // the part of this payment that went to lines of other seasons is not in this list
  const inOtherSeasons = entry.lines.filter((l) => !lines.data.some((p) => p.lineId === l.lineId)).reduce((sum, l) => sum + l.cents, 0);
  const over = total + inOtherSeasons > payment;
  // "Rest": what the line still needs, as far as what is left of the payment reaches
  const rest = (l: { lineId: number; totalCents: number; others: number }) =>
    Math.max(0, Math.min(l.totalCents - l.others, payment - inOtherSeasons - (total - cents(amounts[l.lineId] ?? ""))));

  const save = async () => {
    const chosen = Object.entries(amounts).filter(([, a]) => cents(a) > 0).map(([lineId, a]) => ({ lineId: Number(lineId), amount: decimalText(cents(a), 2) }));
    if (await act(() => api.setCashEntryLines(entry.id, chosen))) onClose();
  };

  return (
    <div className="stack tight">
      <p className="muted">
        Which lines of the budget this payment of {money(payment)} paid (ACTUAL: what the team pays for them, the net out of its fund and the VAT; a payment covers the net first). A line with payments counts in the cash flow only what is still to pay.
      </p>
      <input className="input small" aria-label="Search lines" placeholder="Search a line or a project" value={text} onChange={(e) => setText(e.target.value)} />
      <table className="data-table">
        <thead>
          <tr><th>LINE</th><th>PROJECT</th><th className="num">TEAM PAYS</th><th className="num">PAID BY OTHERS</th><th className="num">THIS PAYMENT</th></tr>
        </thead>
        <tbody>
          {open.slice(0, SHOWN).map((l) => (
            <tr key={l.lineId}>
              <td>{l.item}</td>
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
                <Button small variant="ghost" onClick={() => setAmounts({ ...amounts, [l.lineId]: decimalText(rest(l), 2) })}>Rest</Button>
              </td>
            </tr>
          ))}
          {open.length === 0 && <tr><td colSpan={5} className="empty">No line to pay{text ? " matches" : ""}</td></tr>}
        </tbody>
      </table>
      {open.length > SHOWN && <p className="muted">{open.length - SHOWN} more lines: search to narrow them.</p>}
      <div className="inline-form">
        <span className={over ? "hint error" : "muted"}>Paid on lines: {money(total + inOtherSeasons)} of {money(payment)}</span>
        <Button small disabled={over} onClick={save}>Save</Button>
        <Button small variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
