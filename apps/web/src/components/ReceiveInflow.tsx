import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CashAccount, Inflow } from "../api/types";
import { SearchSelect } from "./SearchSelect";
import { Field, FormPanel } from "./ui";
import { date, moneyFromDecimal } from "../lib/format";
import { todayIso } from "../lib/today";
import { useAction } from "../lib/useAction";
import { fieldSetter, useDraft } from "../lib/useDraft";
import { DraftNote } from "./DraftNote";

const ACCOUNTS: { value: CashAccount; label: string }[] = [
  { value: "bank", label: "BANCA" },
  { value: "cash", label: "CASSA" },
  { value: "paypal", label: "PAYPAL" },
];

/**
 * "Mark as received": an expected inflow has arrived. Either the movement is made now in the register
 * (the day, the account and the amount that really came in), or it is already there (typed by hand,
 * or imported from the sheet of the treasury) and only gets tied to the inflow.
 */
/** `compact` is the short form for the popover: the day, the account and the amount of a new movement (the Voce is the sponsorships' one). */
/** What is written in the form that marks an inflow as received. */
interface ReceiveInflowDraft {
  mode: "new" | "existing";
  on: string;
  account: CashAccount;
  amount: string;
  categoryId: string;
  methodId: string;
  entryId: string;
}

export function ReceiveInflow({ inflow, compact = false, onClose }: { inflow: Inflow; compact?: boolean; onClose: () => void }) {
  const act = useAction();
  const categories = useQuery({ queryKey: ["cash-categories"], queryFn: api.cashCategories });
  const methods = useQuery({ queryKey: ["cash-methods"], queryFn: api.cashMethods });
  const receivable = useQuery({ queryKey: ["receivable"], queryFn: api.receivable });
  const [initial] = useState<ReceiveInflowDraft>(() => ({ mode: "new", on: todayIso(), account: "bank", amount: inflow.amount, categoryId: "", methodId: "", entryId: "" }));
  // what is written is kept while it is typed (the compact form and the full one are the same draft)
  const [form, setForm, saved] = useDraft<ReceiveInflowDraft>(`receive-inflow:${inflow.id}`, initial);
  const { mode, on, account, amount, categoryId, methodId, entryId } = form;
  const set = fieldSetter(setForm);
  const setMode = set("mode");
  const setOn = set("on");
  const setAccount = set("account");
  const setAmount = set("amount");
  const setCategoryId = set("categoryId");
  const setMethodId = set("methodId");
  const setEntryId = set("entryId");

  // a sponsorship goes under the Voce of the sponsorships, as the sheet of the treasury does
  const sponsorshipVoce = inflow.sponsorship ? categories.data?.find((c) => c.sponsorship)?.id : undefined;
  useEffect(() => {
    if (sponsorshipVoce !== undefined) setForm((f) => ({ ...f, categoryId: f.categoryId || String(sponsorshipVoce) }));
  }, [sponsorshipVoce]);

  // the movements of the same amount first: most likely the one
  const choices = [...(receivable.data ?? [])]
    .sort((a, b) => Number(Number(b.amount) === Number(inflow.amount)) - Number(Number(a.amount) === Number(inflow.amount)))
    .map((e) => ({ value: String(e.id), label: `${date(e.on)} · ${e.description || "(no description)"} · ${moneyFromDecimal(e.amount)}` }));

  const submit = async () => {
    const body =
      mode === "existing"
        ? { entryId: Number(entryId) }
        : { on, account, amount, categoryId: categoryId === "" ? null : Number(categoryId), methodId: methodId === "" ? null : Number(methodId) };
    if (await act(() => api.receiveInflow(inflow.id, body))) {
      saved.discard();
      onClose();
    }
  };

  return (
    <FormPanel
      title={`Mark as received: ${inflow.sourceName}`}
      description={compact ? undefined : `Expected ${moneyFromDecimal(inflow.amount)}${inflow.inflowDate ? ` on ${date(inflow.inflowDate)}` : ""}. From then on the cash flow counts the day and the amount of the movement, and the money is in the BANK.`}
      submitLabel="Mark as received"
      canSubmit={mode === "existing" ? entryId !== "" : on !== "" && Number(amount) > 0}
      onSubmit={submit}
      onCancel={() => saved.leave(onClose)}
      layout="stack"
    >
      <DraftNote draft={saved} name={inflow.sourceName} />
      {!compact && (
        <div className="inline-form">
          <label className="checkbox">
            <input type="radio" name="receive-mode" checked={mode === "new"} onChange={() => setMode("new")} />
            Add the movement to the register
          </label>
          <label className="checkbox">
            <input type="radio" name="receive-mode" checked={mode === "existing"} onChange={() => setMode("existing")} />
            It is already in the register
          </label>
        </div>
      )}
      {mode === "new" ? (
        <div className="form-grid">
          <Field label="Data" htmlFor="receive-on">
            <input id="receive-on" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={on} onChange={(e) => setOn(e.target.value)} />
          </Field>
          <Field label="Conto" htmlFor="receive-account">
            <select id="receive-account" className="input small" value={account} onChange={(e) => setAccount(e.target.value as CashAccount)}>
              {ACCOUNTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="Importo (€)" htmlFor="receive-amount">
            <input id="receive-amount" className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {!compact && (
            <>
              <Field label="Voce" htmlFor="receive-voce">
                <SearchSelect id="receive-voce" value={categoryId} onChange={setCategoryId} choices={[{ value: "", label: "—" }, ...(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
              </Field>
              <Field label="Metodo di pagamento" htmlFor="receive-method">
                <select id="receive-method" className="input small" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                  <option value="">—</option>
                  {(methods.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>
      ) : (
        <Field label="Movement of the register (money in, not yet tied to an inflow)" htmlFor="receive-entry">
          <SearchSelect id="receive-entry" value={entryId} onChange={setEntryId} choices={[{ value: "", label: "—" }, ...choices]} />
        </Field>
      )}
    </FormPanel>
  );
}
