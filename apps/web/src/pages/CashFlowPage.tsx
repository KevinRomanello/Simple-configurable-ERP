import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Inflow, Phase } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { MonthlyInflows } from "../components/MonthlyInflows";
import { Cards, DataTable, Field, FormPanel, MoneyCard, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { date, moneyFromDecimal } from "../lib/format";
import { useAction } from "../lib/useAction";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

/** CASH FLOW: the money coming in and what is left after the team's spending, then the BANK balance (the order of the sheet). */
export function CashFlowPage() {
  const canEdit = useMe().permissions.canEditShared;
  const [editingBank, setEditingBank] = useState(false);

  return (
    <>
      <PageHeader
        title="CASH FLOW"
        description="Left value = BANK + inflows after the BANK date − the team's purchases and VAT after that date. Every inflow owes 11% VAT, paid on the first day of the next quarter."
        add={canEdit ? { label: "New inflow", form: (close) => <NewInflow onDone={close} /> } : undefined}
        actions={
          canEdit && (
            <Button variant="ghost" icon={faPen} onClick={() => setEditingBank(!editingBank)}>{editingBank ? "Close" : "Set BANK"}</Button>
          )
        }
      />
      <div className="two-columns">
        <PhaseCashFlow phase="estimate" />
        <PhaseCashFlow phase="actual" />
      </div>
      <BankBox editing={editingBank} onDone={() => setEditingBank(false)} />
    </>
  );
}

function BankBox({ editing, onDone }: { editing: boolean; onDone: () => void }) {
  const act = useAction();
  const canEdit = useMe().permissions.canEditShared;
  const bank = useQuery({ queryKey: ["bank"], queryFn: api.bank });
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");

  useEffect(() => {
    setAmount(bank.data?.amount ?? "");
    setDay(bank.data?.asOfDate ?? "");
  }, [bank.data]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => api.setBank({ amount, asOfDate: day || null }))) onDone();
  };

  return (
    <Panel title="BANK">
      <p>
        {bank.data
          ? `${moneyFromDecimal(bank.data.amount)}${bank.data.asOfDate ? ` on ${date(bank.data.asOfDate)}` : ""}`
          : "Not set"}
      </p>
      {canEdit && editing && (
        <form className="inline-form" onSubmit={save}>
          <Field label="Cash value" htmlFor="bank-amount">
            <input id="bank-amount" className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="In date" htmlFor="bank-date">
            <input id="bank-date" className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Button small type="submit" disabled={amount === ""}>Save BANK</Button>
          <Button small variant="ghost" disabled={!bank.data} onClick={async () => { if (await act(() => api.clearBank())) onDone(); }}>Clear</Button>
        </form>
      )}
    </Panel>
  );
}

/** The form to add money coming in, for the expected or the actual side. */
function NewInflow({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const [phase, setPhase] = useState<Phase>("estimate");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");

  const add = async () => {
    if (await act(() => api.createInflow({ phase, sourceName: name.trim(), amount, inflowDate: day || null }))) onDone();
  };

  return (
    <FormPanel
      title="New inflow"
      description="Money that comes in is sponsorship: the team owes 11% VAT on it, paid on the first day of the next quarter."
      submitLabel="Add inflow"
      canSubmit={name.trim() !== "" && amount !== ""}
      onSubmit={add}
      onCancel={onDone}
    >
      <Field label="Side" htmlFor="inflow-phase">
        <select id="inflow-phase" className="input small" value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
          <option value="estimate">Expected</option>
          <option value="actual">Actual</option>
        </select>
      </Field>
      <Field label="Company" htmlFor="inflow-name">
        <input id="inflow-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Contract value" htmlFor="inflow-amount">
        <input id="inflow-amount" className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Inflow date" htmlFor="inflow-day">
        <input id="inflow-day" className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

function PhaseCashFlow({ phase }: { phase: Phase }) {
  const act = useAction();
  const canEdit = useMe().permissions.canEditShared;
  const inflows = useQuery({ queryKey: ["inflows", phase], queryFn: () => api.inflows(phase) });
  const view = useQuery({ queryKey: ["cashflow"], queryFn: api.cashFlow });
  const summary = view.data?.[phase].summary;

  const columns: Column<Inflow>[] = [
    { key: "company", header: "COMPANY", sort: (i) => i.sourceName, cell: (i) => i.sourceName },
    { key: "value", header: "CONTRACT VALUE", num: true, sort: (i) => Number(i.amount), cell: (i) => moneyFromDecimal(i.amount) },
    { key: "date", header: "INFLOW DATE", sort: (i) => i.inflowDate, cell: (i) => date(i.inflowDate) },
    {
      key: "delete",
      header: "",
      num: true,
      cell: (i) => canEdit && <IconButton icon={faTrash} label="Delete inflow" danger onClick={() => act(() => api.deleteInflow(i.id))} />,
    },
  ];

  return (
    <Panel title={TITLE[phase]}>
      <DataTable
        title={`${phase === "estimate" ? "Expected" : "Actual"} cash inflows`}
        columns={columns}
        rows={inflows.data}
        rowKey={(i) => i.id}
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
