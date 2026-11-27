import { faPen } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { budgetApi } from "./api";
import type { Bank, Inflow } from "./types";
import type { Phase } from "../../core/calcTypes";
import { Button } from "../../core/Button";
import { DraftNote } from "../../core/DraftNote";
import { MonthlyInflows } from "./MonthlyInflows";
import { Cards, DataTable, Field, FormPanel, MoneyCard, PageHeader, Panel, RowAction, type Column } from "../../core/ui";
import { DraftGuardContext, useAdder } from "../../core/draftGuard";
import { date, moneyFromDecimal } from "../../core/format";
import { useCanChangeInflows, useCanManageCash } from "../../platform/season";
import { useAction } from "../../core/useAction";
import { useSlot } from "../../core/slots";
import { inflowActions } from "./slots";
import { fieldSetter, useDraft, useRemembered } from "../../core/useDraft";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

/** CASH FLOW: the money coming in and what is left after the team's spending, then the BANK balance (the order of the sheet). */
export function CashFlowPage() {
  const canEdit = useCanManageCash();
  const canChange = useCanChangeInflows();
  // the BANK form starts open when it has a draft; closing it with the button asks first when something is written
  const bankForm = useAdder("bank");
  // a BANK that the register gives is not written here
  const fromRegister = useQuery({ queryKey: ["bank"], queryFn: budgetApi.bank }).data?.source === "register";

  return (
    <>
      <PageHeader
        title="CASH FLOW"
        description="Left value = BANK + inflows after the BANK date − the team's purchases and VAT after that date. The BANK is what the register holds in Cassa and Banca today, when the register has it; then an expected inflow is marked as received when the money arrives, and one that is late counts from the day after the BANK. An inflow of sponsorship owes 11% VAT, paid on the first day of the next quarter."
        add={canChange ? { label: "New inflow", draftKey: "new-inflow", form: (close) => <NewInflow fromRegister={fromRegister} onDone={close} /> } : undefined}
        actions={
          canEdit && !fromRegister && (
            <Button variant="ghost" icon={faPen} onClick={bankForm.toggle}>{bankForm.adding ? "Close" : "Set BANK"}</Button>
          )
        }
      />
      <div className="two-columns">
        <PhaseCashFlow phase="estimate" />
        <PhaseCashFlow phase="actual" />
      </div>
      <DraftGuardContext.Provider value={bankForm.report}>
        <BankBox editing={bankForm.adding} onDone={bankForm.hide} />
      </DraftGuardContext.Provider>
    </>
  );
}

function BankBox({ editing, onDone }: { editing: boolean; onDone: () => void }) {
  const canEdit = useCanManageCash();
  const bank = useQuery({ queryKey: ["bank"], queryFn: budgetApi.bank });

  return (
    <Panel title="BANK">
      <p>
        {bank.data
          ? `${moneyFromDecimal(bank.data.amount)}${bank.data.asOfDate ? ` on ${date(bank.data.asOfDate)}` : ""}`
          : "Not set"}
      </p>
      {bank.data?.source === "register" && (
        <p className="muted">From the register: Cassa + Banca at the end of that day. To change it, change the movements of the register.</p>
      )}
      {canEdit && editing && bank.isFetched && bank.data?.source !== "register" && <BankForm bank={bank.data ?? null} onDone={onDone} />}
    </Panel>
  );
}

/** The form that writes the BANK by hand; it starts from the saved one, and what is written is kept (key `bank`). */
function BankForm({ bank, onDone }: { bank: Bank | null; onDone: () => void }) {
  const act = useAction();
  const [initial] = useState(() => ({ amount: bank?.amount ?? "", day: bank?.asOfDate ?? "" }));
  // the saved BANK is what the draft started from: if it is another when the draft is found, someone changed it meanwhile
  const [form, setForm, saved] = useDraft("bank", initial, { base: JSON.stringify(initial) });
  const { amount, day } = form;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => budgetApi.setBank({ amount, asOfDate: day || null }))) {
      saved.discard();
      onDone();
    }
  };
  const clear = async () => {
    if (await act(() => budgetApi.clearBank())) {
      saved.discard();
      onDone();
    }
  };

  return (
    <form className="inline-form" onSubmit={save}>
      <DraftNote draft={saved} name="The BANK" />
      <Field label="Cash value" htmlFor="bank-amount">
        <input id="bank-amount" className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
      </Field>
      <Field label="In date" htmlFor="bank-date">
        <input id="bank-date" className="input small" type="date" value={day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} />
      </Field>
      <Button small type="submit" disabled={amount === ""}>Save BANK</Button>
      <Button small variant="ghost" disabled={!bank} onClick={clear}>Clear</Button>
    </form>
  );
}

/** What is written in the form that adds an inflow. */
interface InflowDraft {
  phase: Phase;
  name: string;
  amount: string;
  day: string;
  sponsorship: boolean;
}

/** The form to add money coming in, for the expected or the actual side. */
function NewInflow({ fromRegister, onDone }: { fromRegister: boolean; onDone: () => void }) {
  const act = useAction();
  const [initial] = useState<InflowDraft>({ phase: "estimate", name: "", amount: "", day: "", sponsorship: true });
  const [form, setForm, saved] = useDraft<InflowDraft>("new-inflow", initial);
  const { phase, name, amount, day, sponsorship } = form;
  const set = fieldSetter(setForm);
  const [setPhase, setName, setAmount, setDay, setSponsorship] = [set("phase"), set("name"), set("amount"), set("day"), set("sponsorship")];

  const add = async () => {
    if (await act(() => budgetApi.createInflow({ phase, sourceName: name.trim(), amount, inflowDate: day || null, sponsorship }))) {
      saved.discard();
      onDone();
    }
  };

  return (
    <FormPanel
      title="New inflow"
      description={`Sponsorship is invoiced: the team owes 11% VAT on it, paid on the first day of the next quarter. Any other money that comes in (a membership fee) owes none.${fromRegister ? " The money that has arrived (Actual) is in the register: add it there." : ""}`}
      submitLabel="Add inflow"
      canSubmit={name.trim() !== "" && amount !== ""}
      onSubmit={add}
      onCancel={() => saved.leave(onDone)}
    >
      <DraftNote draft={saved} />
      {!fromRegister && (
        <Field label="Side" htmlFor="inflow-phase">
          <select id="inflow-phase" className="input small" value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
            <option value="estimate">Expected</option>
            <option value="actual">Actual</option>
          </select>
        </Field>
      )}
      <Field label="Company" htmlFor="inflow-name">
        <input id="inflow-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Contract value" htmlFor="inflow-amount">
        <input id="inflow-amount" className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Inflow date" htmlFor="inflow-day">
        <input id="inflow-day" className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={sponsorship} onChange={(e) => setSponsorship(e.target.checked)} />
        Sponsorship (owes 11% VAT)
      </label>
    </FormPanel>
  );
}

function PhaseCashFlow({ phase }: { phase: Phase }) {
  const actions = useSlot(inflowActions);
  const inflows = useQuery({ queryKey: ["inflows", phase], queryFn: () => budgetApi.inflows(phase) });
  const view = useQuery({ queryKey: ["cashflow"], queryFn: budgetApi.cashFlow });
  const summary = view.data?.[phase].summary;
  // the inflow whose action is open, one at a time, remembered with its form: coming back to the page the panel is open with what was
  // written (deleting has no form to keep: it starts closed)
  const [open, setOpen] = useRemembered<{ key: string; id: number } | null>(`cash-flow:${phase}:open`, null, (o) =>
    o === null ? null : (actions.find((a) => a.key === o.key)?.draftKey?.(o.id) ?? null),
  );
  const close = () => setOpen(null);
  const fromRegister = inflows.data?.some((i) => i.source === "register") ?? false;

  const columns: Column<Inflow>[] = [
    { key: "company", header: "COMPANY", sort: (i) => i.sourceName, cell: (i) => i.sourceName },
    { key: "value", header: "CONTRACT VALUE", num: true, sort: (i) => Number(i.amount), cell: (i) => moneyFromDecimal(i.amount) },
    { key: "date", header: "INFLOW DATE", sort: (i) => i.inflowDate, cell: (i) => date(i.inflowDate) },
    { key: "sponsorship", header: "SPONSORSHIP", sort: (i) => (i.sponsorship ? 1 : 0), cell: (i) => (i.sponsorship ? "yes" : "no") },
    // the expected side says whether the money arrived (the actual side is the register itself)
    ...(phase === "estimate"
      ? [{
          key: "status",
          header: "STATUS",
          sort: (i: Inflow) => (i.late ? 0 : i.receivedOn ? 2 : 1),
          cell: (i: Inflow) =>
            i.late ? <span className="pill High">Late</span> : i.receivedOn ? `Received ${date(i.receivedOn)}${i.receivedAmount !== i.amount ? ` · ${moneyFromDecimal(i.receivedAmount)}` : ""}` : "",
        }]
      : []),
    // the actions the others add to an inflow: receiving it into the register, deleting it with the register's (the bridge to the treasury)
    { key: "actions", header: "", num: true, cell: (i) => actions.map((a) => <a.Buttons key={a.key} row={i} open={() => setOpen({ key: a.key, id: i.id })} />) },
  ];

  return (
    <Panel title={TITLE[phase]}>
      {phase === "actual" && fromRegister && <p className="muted">The sponsorship movements of the register in this season, as they are there (add or change them in the register).</p>}
      <DataTable
        title={`${phase === "estimate" ? "Expected" : "Actual"} cash inflows`}
        columns={columns}
        rows={inflows.data}
        rowKey={(i) => i.id}
        rowClass={(i) => (open?.id === i.id ? "row-selected" : undefined)}
        expand={(i, colSpan) => {
          const action = open?.id === i.id ? actions.find((a) => a.key === open.key) : undefined;
          return (
            action && (
              <RowAction
                colSpan={colSpan}
                eyebrow={action.eyebrow}
                title={action.title?.(i) ?? i.sourceName}
                context={action.context?.(i)}
                quick={action.Quick && <action.Quick key={`quick-${i.id}`} row={i} onClose={close} />}
                onClose={close}
              >
                <action.Form row={i} onClose={close} />
              </RowAction>
            )
          );
        }}
        empty="No inflows yet"
      />
      {summary && (
        <Cards>
          <MoneyCard caption="Total cash flow" cents={summary.totalCashFlowCents} />
          <MoneyCard caption="Left value" cents={summary.leftValueCents} />
        </Cards>
      )}
      <MonthlyInflows phase={phase} monthly={view.data?.[phase].monthly ?? []} />
    </Panel>
  );
}
