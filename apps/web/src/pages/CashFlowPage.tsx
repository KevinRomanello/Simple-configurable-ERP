import { faCheck, faPen, faRotateLeft, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Inflow, Phase } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { MonthlyInflows } from "../components/MonthlyInflows";
import { ReceiveInflow } from "../components/ReceiveInflow";
import { Cards, DataTable, Field, FormPanel, MoneyCard, PageHeader, Panel, type Column } from "../components/ui";
import { date, moneyFromDecimal } from "../lib/format";
import { useCanManageCash } from "../lib/season";
import { useAction } from "../lib/useAction";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

/** CASH FLOW: the money coming in and what is left after the team's spending, then the BANK balance (the order of the sheet). */
export function CashFlowPage() {
  const canEdit = useCanManageCash();
  const [editingBank, setEditingBank] = useState(false);
  // a BANK that the register gives is not written here
  const fromRegister = useQuery({ queryKey: ["bank"], queryFn: api.bank }).data?.source === "register";

  return (
    <>
      <PageHeader
        title="CASH FLOW"
        description="Left value = BANK + inflows after the BANK date − the team's purchases and VAT after that date. The BANK is what the register holds in Cassa and Banca today, when the register has it; then an expected inflow is marked as received when the money arrives, and one that is late counts from the day after the BANK. An inflow of sponsorship owes 11% VAT, paid on the first day of the next quarter."
        add={canEdit ? { label: "New inflow", form: (close) => <NewInflow fromRegister={fromRegister} onDone={close} /> } : undefined}
        actions={
          canEdit && !fromRegister && (
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
  const canEdit = useCanManageCash();
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
      {bank.data?.source === "register" && (
        <p className="muted">From the register: Cassa + Banca at the end of that day. To change it, change the movements of the register.</p>
      )}
      {canEdit && editing && bank.data?.source !== "register" && (
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
function NewInflow({ fromRegister, onDone }: { fromRegister: boolean; onDone: () => void }) {
  const act = useAction();
  const [phase, setPhase] = useState<Phase>("estimate");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [sponsorship, setSponsorship] = useState(true);

  const add = async () => {
    if (await act(() => api.createInflow({ phase, sourceName: name.trim(), amount, inflowDate: day || null, sponsorship }))) onDone();
  };

  return (
    <FormPanel
      title="New inflow"
      description={`Sponsorship is invoiced: the team owes 11% VAT on it, paid on the first day of the next quarter. Any other money that comes in (a membership fee) owes none.${fromRegister ? " The money that has arrived (Actual) is in the register: add it there." : ""}`}
      submitLabel="Add inflow"
      canSubmit={name.trim() !== "" && amount !== ""}
      onSubmit={add}
      onCancel={onDone}
    >
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
  const act = useAction();
  const canEdit = useCanManageCash();
  const inflows = useQuery({ queryKey: ["inflows", phase], queryFn: () => api.inflows(phase) });
  const view = useQuery({ queryKey: ["cashflow"], queryFn: api.cashFlow });
  const summary = view.data?.[phase].summary;
  const [receiving, setReceiving] = useState<Inflow | null>(null);
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
    {
      key: "actions",
      header: "",
      num: true,
      cell: (i) =>
        canEdit &&
        i.source === "typed" && (
          <>
            {phase === "estimate" && (i.cashEntryId === null
              ? <IconButton icon={faCheck} label="Mark as received" onClick={() => setReceiving(i)} />
              : <IconButton icon={faRotateLeft} label="Not received" onClick={() => act(() => api.unreceiveInflow(i.id))} />)}
            <IconButton icon={faTrash} label="Delete inflow" danger onClick={() => act(() => api.deleteInflow(i.id))} />
          </>
        ),
    },
  ];

  return (
    <Panel title={TITLE[phase]}>
      {receiving && <ReceiveInflow inflow={receiving} onClose={() => setReceiving(null)} />}
      {phase === "actual" && fromRegister && <p className="muted">The sponsorship movements of the register in this season, as they are there (add or change them in the register).</p>}
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
