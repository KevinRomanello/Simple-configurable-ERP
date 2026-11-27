import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { treasuryApi } from "../../modules/treasury/api";
import { treasuryBudgetApi } from "./api";
import type { CashAccount } from "../../modules/treasury/types";
import type { ToPayRow } from "./types";
import { SearchSelect } from "../../core/SearchSelect";
import { Field, FormPanel, Table, TableScroll } from "../../core/ui";
import { money } from "../../core/format";
import { decimalText } from "../../modules/budget/lineEdit";
import { todayIso } from "../../core/today";
import { useAction } from "../../core/useAction";
import { useDraft } from "../../core/useDraft";
import { DraftNote } from "../../core/DraftNote";

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
/** What is written in the form of a payment. */
interface PayDraft {
  on: string;
  account: CashAccount;
  methodId: string;
  voceId: string;
  description: string;
  amounts: Record<number, string>;
}

/** The title of the payment of these lines. */
const payTitle = (rows: ToPayRow[]) => (rows.length === 1 ? `Pay: ${rows[0]!.item}` : `Pay ${rows.length} lines in one payment`);

/**
 * `compact` is the short form of one line for the popover: the day, the account and the amount; the method, the Voce and the
 * description are the ones the full form starts from (the same payment, with fewer boxes to see).
 */
export function PayForm({ rows, lastMethodId, compact = false, onDone }: { rows: ToPayRow[]; lastMethodId: number | null; compact?: boolean; onDone: () => void }) {
  const act = useAction();
  const methods = useQuery({ queryKey: ["cash-methods"], queryFn: treasuryApi.cashMethods });
  const voci = useQuery({ queryKey: ["cash-categories"], queryFn: treasuryApi.cashCategories });

  const suppliers = [...new Set(rows.map((r) => r.supplierName).filter((s): s is string => s !== null))];
  // the Voce the categories of the lines start from, when they all agree
  const suggested = new Set(rows.map((r) => r.suggestedCategoryId));
  const [initial] = useState<PayDraft>(() => ({
    on: todayIso(),
    account: "bank",
    methodId: lastMethodId === null ? "" : String(lastMethodId),
    voceId: suggested.size === 1 && !suggested.has(null) ? String([...suggested][0]) : "",
    description: `${suppliers.length > 0 ? `${suppliers.join(", ")} — ` : ""}${rows.map((r) => r.item).join(", ")}`.slice(0, 500),
    amounts: Object.fromEntries(rows.map((r) => [r.lineId, decimalText(r.dueCents, 2)])),
  }));
  // what is written is kept while it is typed (the compact form and the full one are the same draft)
  const [form, setForm, saved] = useDraft<PayDraft>(`pay:${rows.map((r) => r.lineId).join(",")}`, initial);
  const { on, account, methodId, voceId, description, amounts } = form;
  const setOn = (value: string) => setForm((f) => ({ ...f, on: value }));
  const setAccount = (value: CashAccount) => setForm((f) => ({ ...f, account: value }));
  const setMethodId = (value: string) => setForm((f) => ({ ...f, methodId: value }));
  const setVoceId = (value: string) => setForm((f) => ({ ...f, voceId: value }));
  const setDescription = (value: string) => setForm((f) => ({ ...f, description: value }));
  const setAmounts = (value: Record<number, string>) => setForm((f) => ({ ...f, amounts: value }));

  const total = rows.reduce((sum, r) => sum + cents(amounts[r.lineId] ?? ""), 0);
  const tooMuch = rows.some((r) => cents(amounts[r.lineId] ?? "") > r.dueCents);
  const submit = async () => {
    const lines = rows.filter((r) => cents(amounts[r.lineId] ?? "") > 0).map((r) => ({ lineId: r.lineId, amount: decimalText(cents(amounts[r.lineId]!), 2) }));
    const body = { on, account, methodId: methodId === "" ? null : Number(methodId), categoryId: voceId === "" ? null : Number(voceId), description: description.trim() || undefined, lines };
    if (await act(() => treasuryBudgetApi.payLines(body))) {
      saved.discard();
      onDone();
    }
  };

  return (
    <FormPanel
      title={payTitle(rows)}
      description={compact ? undefined : "The payment is made in the register, tied to the lines, and they leave this list. It covers the net first and then the VAT: lower an amount to pay a line in instalments."}
      submitLabel={`Pay ${money(total)}`}
      canSubmit={total > 0 && !tooMuch && on !== ""}
      onSubmit={submit}
      onCancel={() => saved.leave(onDone)}
      layout="stack"
    >
      <DraftNote draft={saved} />
      <div className="form-grid">
        <Field label="Data" htmlFor="pay-on">
          <input id="pay-on" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={on} onChange={(e) => setOn(e.target.value)} />
        </Field>
        <Field label="Conto" htmlFor="pay-account">
          <select id="pay-account" className="input small" value={account} onChange={(e) => setAccount(e.target.value as CashAccount)}>
            {ACCOUNTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        {!compact && (
          <>
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
          </>
        )}
        {compact && rows[0] && (
          <Field label="Importo (€)" htmlFor="pay-amount" className="wide">
            <input
              id="pay-amount"
              className={`input small${cents(amounts[rows[0].lineId] ?? "") > rows[0].dueCents ? " error" : ""}`}
              type="number"
              min="0"
              step="0.01"
              value={amounts[rows[0].lineId] ?? ""}
              onChange={(e) => setAmounts({ ...amounts, [rows[0]!.lineId]: e.target.value })}
            />
          </Field>
        )}
      </div>
      {!compact && <TableScroll>
        <Table>
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
        </Table>
      </TableScroll>}
      {tooMuch && <p className="hint error">An amount is above what is left to pay of its line.</p>}
    </FormPanel>
  );
}
