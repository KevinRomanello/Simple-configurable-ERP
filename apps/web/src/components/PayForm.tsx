import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { CashAccount, ToPayRow } from "../api/types";
import { SearchSelect } from "./SearchSelect";
import { Field, FormPanel } from "./ui";
import { money } from "../lib/format";
import { decimalText } from "../lib/lineEdit";
import { todayIso } from "../lib/today";
import { useAction } from "../lib/useAction";

const ACCOUNTS: { value: CashAccount; label: string }[] = [
  { value: "bank", label: "BANCA" },
  { value: "cash", label: "CASSA" },
  { value: "paypal", label: "PAYPAL" },
];
const cents = (text: string) => Math.round(Number(text.replace(",", ".")) * 100) || 0;

/**
 * "Pay": the payment of one or more lines of the budget, made in the register in one go. It starts from what is
 * left of each line (the net and the VAT), the Voce its category starts from and the method of the last payment;
 * an amount can be lowered (a line paid in instalments). One payment for several lines is one bank transfer.
 */
export function PayForm({ rows, lastMethodId, onDone }: { rows: ToPayRow[]; lastMethodId: number | null; onDone: () => void }) {
  const act = useAction();
  const methods = useQuery({ queryKey: ["cash-methods"], queryFn: api.cashMethods });
  const voci = useQuery({ queryKey: ["cash-categories"], queryFn: api.cashCategories });

  const suppliers = [...new Set(rows.map((r) => r.supplierName).filter((s): s is string => s !== null))];
  const [on, setOn] = useState(todayIso());
  const [account, setAccount] = useState<CashAccount>("bank");
  const [methodId, setMethodId] = useState(lastMethodId === null ? "" : String(lastMethodId));
  // the Voce the categories of the lines start from, when they all agree
  const suggested = new Set(rows.map((r) => r.suggestedCategoryId));
  const [voceId, setVoceId] = useState(suggested.size === 1 && !suggested.has(null) ? String([...suggested][0]) : "");
  const [description, setDescription] = useState(`${suppliers.length > 0 ? `${suppliers.join(", ")} — ` : ""}${rows.map((r) => r.item).join(", ")}`.slice(0, 500));
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries(rows.map((r) => [r.lineId, decimalText(r.dueCents, 2)])));

  const total = rows.reduce((sum, r) => sum + cents(amounts[r.lineId] ?? ""), 0);
  const tooMuch = rows.some((r) => cents(amounts[r.lineId] ?? "") > r.dueCents);
  const submit = async () => {
    const lines = rows.filter((r) => cents(amounts[r.lineId] ?? "") > 0).map((r) => ({ lineId: r.lineId, amount: decimalText(cents(amounts[r.lineId]!), 2) }));
    const body = { on, account, methodId: methodId === "" ? null : Number(methodId), categoryId: voceId === "" ? null : Number(voceId), description: description.trim() || undefined, lines };
    if (await act(() => api.payLines(body))) onDone();
  };

  return (
    <FormPanel
      title={rows.length === 1 ? `Pay: ${rows[0]!.item}` : `Pay ${rows.length} lines in one payment`}
      description="The payment is made in the register, tied to the lines, and they leave this list. It covers the net first and then the VAT: lower an amount to pay a line in instalments."
      submitLabel={`Pay ${money(total)}`}
      canSubmit={total > 0 && !tooMuch && on !== ""}
      onSubmit={submit}
      onCancel={onDone}
      layout="stack"
    >
      <div className="form-grid">
        <Field label="Data" htmlFor="pay-on">
          <input id="pay-on" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={on} onChange={(e) => setOn(e.target.value)} />
        </Field>
        <Field label="Conto" htmlFor="pay-account">
          <select id="pay-account" className="input small" value={account} onChange={(e) => setAccount(e.target.value as CashAccount)}>
            {ACCOUNTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        <Field label="Metodo di pagamento" htmlFor="pay-method">
          <select id="pay-method" className="input small" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            <option value="">—</option>
            {(methods.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Voce" htmlFor="pay-voce">
          <SearchSelect id="pay-voce" value={voceId} onChange={setVoceId} choices={[{ value: "", label: "—" }, ...(voci.data ?? []).map((v) => ({ value: String(v.id), label: v.name }))]} />
        </Field>
        <Field label="Descrizione" htmlFor="pay-description" className="wide">
          <input id="pay-description" className="input small" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <table className="data-table">
        <thead>
          <tr><th>LINE</th><th className="num">LEFT TO PAY</th><th className="num">THIS PAYMENT</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lineId}>
              <td>{r.item}</td>
              <td className="num" title={`net ${money(r.unpaidFundCents)} + VAT ${money(r.unpaidVatCents)}`}>{money(r.dueCents)}</td>
              <td className="num">
                <input
                  className={`input small${cents(amounts[r.lineId] ?? "") > r.dueCents ? " error" : ""}`}
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label={`Amount for ${r.item}`}
                  value={amounts[r.lineId] ?? ""}
                  onChange={(e) => setAmounts({ ...amounts, [r.lineId]: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tooMuch && <p className="hint error">An amount is above what is left to pay of its line.</p>}
    </FormPanel>
  );
}
