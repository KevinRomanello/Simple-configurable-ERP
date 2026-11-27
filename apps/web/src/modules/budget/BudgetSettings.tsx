import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { budgetApi } from "./api";
import type { BankCompare, Calculation } from "./types";
import { platformApi } from "../../platform/api";
import { SeasonsPanel } from "../../platform/SeasonsPanel";
import { VatRatesPanel } from "../../platform/VatRatesPanel";
import { Button } from "../../core/Button";
import { DraftNote } from "../../core/DraftNote";
import { Field, Loading, Panel } from "../../core/ui";
import { useAction } from "../../core/useAction";
import { useDraft } from "../../core/useDraft";

/** The Budget section of Settings (admins, docs/impostazioni.md): the seasons, the switches of the calculation and the VAT rates. */
export function BudgetSettings() {
  const view = useQuery({ queryKey: ["settings"], queryFn: platformApi.settings });
  // the switches of the calculation are the budget's: they come from its own address
  const calculation = useQuery({ queryKey: ["calculation"], queryFn: budgetApi.calculation });
  if (!view.data || !calculation.data) return <Loading />;
  return (
    <>
      <SeasonsPanel />
      <CalculationPanel key={JSON.stringify(calculation.data)} calculation={calculation.data} />
      <VatRatesPanel rates={view.data.vatRates} />
    </>
  );
}

/** One switch: its box on the left, what it does on the right. */
function Setting({ children, explanation }: { children: ReactNode; explanation: ReactNode }) {
  return (
    <div className="setting">
      {children}
      <div className="muted">{explanation}</div>
    </div>
  );
}

function CalculationPanel({ calculation }: { calculation: Calculation }) {
  const act = useAction();
  const asDraft = (c: Calculation) => ({ ...c, variancePercent: String(Math.round(c.varianceThreshold * 10_000) / 100), inflowRate: String(c.inflowVatRate) });
  // what is written is kept while it is typed; the panel starts over (key) when the saved values change, and a draft started from other values says so
  const [initial] = useState(() => asDraft(calculation));
  const [draft, setDraft, saved] = useDraft("settings:calculation", initial, { base: JSON.stringify(initial) });
  const changed = JSON.stringify(initial) !== JSON.stringify(draft);
  const set = (change: Partial<typeof draft>) => setDraft({ ...draft, ...change });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await act(() =>
      budgetApi.updateCalculation({
        varianceThreshold: Number(draft.variancePercent) / 100,
        inflowVatRate: Number(draft.inflowRate),
        vatBaseWhenTotalSponsor: draft.vatBaseWhenTotalSponsor,
        bankCompare: draft.bankCompare,
      }),
    );
    if (ok) saved.discard();
  };
  const compareChoice = (id: string, value: BankCompare, onChange: (value: BankCompare) => void) => (
    <select id={id} className="input small" value={value} onChange={(e) => onChange(e.target.value as BankCompare)}>
      <option value="day">By day</option>
      <option value="month">By month</option>
    </select>
  );

  return (
    <Panel title="Calculation">
      <form className="stack" onSubmit={save}>
        <DraftNote draft={saved} name="The calculation settings" />
        <Setting explanation="TOTAL highlights in red the variances between expected and actual outflow beyond this, up or down.">
          <Field label="Variance highlighted in TOTAL (%)" htmlFor="set-variance">
            <input id="set-variance" className="input small" type="number" min="0" max="100" step="0.01" value={draft.variancePercent} onChange={(e) => set({ variancePercent: e.target.value })} />
          </Field>
        </Setting>
        <Setting explanation="Money that comes in (CASH FLOW, New inflow) is sponsorship, which is invoiced: the team owes this VAT on every inflow, paid on the first day of the next quarter.">
          <Field label="VAT on inflows (%)" htmlFor="set-inflow-vat">
            <input id="set-inflow-vat" className="input small" type="number" min="0" max="100" step="0.01" value={draft.inflowRate} onChange={(e) => set({ inflowRate: e.target.value })} />
          </Field>
        </Setting>
        <Setting
          explanation={
            <>
              <p>
                When a sponsor covers a whole line (goods given with a counter-invoice, for example advertising), the team still pays the VAT
                of the counter-invoice. This says what that VAT is computed on. Example: goods worth 1,000.00 € from a sponsor at 11%.
              </p>
              <ul>
                <li><strong>On the whole value</strong>: 110.00 € of VAT for the team. This is what the treasurer confirmed (21 October 2026).</li>
                <li><strong>On what the sponsor does not cover</strong>: the sponsor covers everything, so 0.00 €: the counter-invoice costs nothing.</li>
              </ul>
              <p>It changes every line paid by such a sponsor, at once.</p>
            </>
          }
        >
          <Field label="VAT when a sponsor covers the whole line" htmlFor="set-vat-base">
            <select id="set-vat-base" className="input small" value={draft.vatBaseWhenTotalSponsor} onChange={(e) => set({ vatBaseWhenTotalSponsor: e.target.value as Calculation["vatBaseWhenTotalSponsor"] })}>
              <option value="net">On the whole value</option>
              <option value="net-minus-sponsor">On what the sponsor does not cover</option>
            </select>
          </Field>
        </Setting>
        <Setting
          explanation={
            <>
              The BANK balance is taken on a day: what happened before it is already in the balance. <strong>By day</strong>: an inflow,
              a purchase or a VAT payment counts if it comes after that day. <strong>By month</strong>: only if it is in a later month,
              so everything in the month of the BANK counts as already in it. The old sheet used by day for the summary and by month for the Gantt.
            </>
          }
        >
          <div className="inline-form">
            <Field label="BANK date, in the CASH FLOW summary" htmlFor="set-bank-summary">
              {compareChoice("set-bank-summary", draft.bankCompare.summary, (summary) => set({ bankCompare: { ...draft.bankCompare, summary } }))}
            </Field>
            <Field label="BANK date, in the Gantt" htmlFor="set-bank-timeline">
              {compareChoice("set-bank-timeline", draft.bankCompare.timeline, (timeline) => set({ bankCompare: { ...draft.bankCompare, timeline } }))}
            </Field>
          </div>
        </Setting>
        <div className="inline-form">
          <Button small type="submit" disabled={!changed}>Save</Button>
          <Button small variant="ghost" disabled={!changed} onClick={saved.discard}>Undo</Button>
        </div>
      </form>
    </Panel>
  );
}
