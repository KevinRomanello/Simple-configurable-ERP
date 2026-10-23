import { faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Inflow, MonthlyInflow, Phase } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Button, IconButton } from "../components/Button";
import { MoneyCard } from "../components/Cards";
import { date, money, moneyFromDecimal, month } from "../lib/format";
import { useMe } from "../lib/auth";
import { useAction } from "../lib/useAction";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

const INFLOWS_SORT: SortAccessors<Inflow> = {
  company: (i) => i.sourceName,
  value: (i) => Number(i.amount),
  date: (i) => i.inflowDate,
};
const MONTHLY_SORT: SortAccessors<MonthlyInflow> = {
  month: (m) => m.month,
  inflow: (m) => m.totalCents,
};

/** CASH FLOW: the BANK balance, the money coming in, and what is left after the team's spending. */
export function CashFlowPage() {
  const canEdit = useMe().permissions.canEditShared;
  const [open, setOpen] = useState<"inflow" | "bank" | null>(null);
  const toggle = (what: "inflow" | "bank") => setOpen(open === what ? null : what);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>CASH FLOW</h1>
          <p className="muted">
            Left value = BANK + inflows after the BANK date − the team's purchases and VAT after that date.
          </p>
        </div>
        <div className="actions">
          {canEdit && <Button icon={faPlus} onClick={() => toggle("inflow")}>{open === "inflow" ? "Close" : "New inflow"}</Button>}
          {canEdit && <Button variant="ghost" icon={faPen} onClick={() => toggle("bank")}>{open === "bank" ? "Close" : "Set BANK"}</Button>}
          <DownloadMenu />
        </div>
      </header>

      {open === "inflow" && <NewInflow onDone={() => setOpen(null)} />}
      <BankBox editing={open === "bank"} onDone={() => setOpen(null)} />
      <div className="two-columns">
        <PhaseCashFlow phase="estimate" />
        <PhaseCashFlow phase="actual" />
      </div>
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
    <section className="panel">
      <h2>BANK</h2>
      <p>
        {bank.data
          ? `${moneyFromDecimal(bank.data.amount)}${bank.data.asOfDate ? ` on ${date(bank.data.asOfDate)}` : ""}`
          : "Not set"}
      </p>
      {canEdit && editing && (
        <form className="inline-form" onSubmit={save}>
          <div className="field">
            <label htmlFor="bank-amount">Cash value</label>
            <input id="bank-amount" className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bank-date">In date</label>
            <input id="bank-date" className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <Button small type="submit" disabled={amount === ""}>Save BANK</Button>
          <Button small variant="ghost" disabled={!bank.data} onClick={async () => { if (await act(() => api.clearBank())) onDone(); }}>Clear</Button>
        </form>
      )}
    </section>
  );
}

/** The form to add money coming in, for the expected or the actual side. */
function NewInflow({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const [phase, setPhase] = useState<Phase>("estimate");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => api.createInflow({ phase, sourceName: name.trim(), amount, inflowDate: day || null }))) onDone();
  };

  return (
    <section className="panel">
      <h2>New inflow</h2>
      <form className="inline-form" onSubmit={add}>
        <div className="field">
          <label htmlFor="inflow-phase">Side</label>
          <select id="inflow-phase" className="input small" value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
            <option value="estimate">Expected</option>
            <option value="actual">Actual</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="inflow-name">Company</label>
          <input id="inflow-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="inflow-amount">Contract value</label>
          <input id="inflow-amount" className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="inflow-day">Inflow date</label>
          <input id="inflow-day" className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <Button small icon={faPlus} type="submit" disabled={name.trim() === "" || amount === ""}>Add inflow</Button>
        <Button small variant="ghost" onClick={onDone}>Cancel</Button>
      </form>
    </section>
  );
}

function PhaseCashFlow({ phase }: { phase: Phase }) {
  const act = useAction();
  const canEdit = useMe().permissions.canEditShared;
  const inflows = useQuery({ queryKey: ["inflows", phase], queryFn: () => api.inflows(phase) });
  const view = useQuery({ queryKey: ["cashflow"], queryFn: api.cashFlow });
  const byInflow = useSort(INFLOWS_SORT);
  const byMonth = useSort(MONTHLY_SORT);

  const summary = view.data?.[phase].summary;
  const monthly = view.data?.[phase].monthly ?? [];

  return (
    <section className="panel">
      <h2>{TITLE[phase]}</h2>

      {summary && (
        <div className="cards">
          <MoneyCard caption="Total cash flow" cents={summary.totalCashFlowCents} />
          <MoneyCard caption="Left value" cents={summary.leftValueCents} />
        </div>
      )}

      <TableBox title={`${phase === "estimate" ? "Expected" : "Actual"} cash inflows`}>
        <table className="data-table">
          <thead>
            <tr>
              <SortTh sort={byInflow} by="company">COMPANY</SortTh>
              <SortTh sort={byInflow} by="value" className="num">CONTRACT VALUE</SortTh>
              <SortTh sort={byInflow} by="date">INFLOW DATE</SortTh>
              <th />
            </tr>
          </thead>
          <tbody>
            {byInflow.sorted(inflows.data ?? []).map((i) => (
              <tr key={i.id}>
                <td>{i.sourceName}</td>
                <td className="num">{moneyFromDecimal(i.amount)}</td>
                <td>{date(i.inflowDate)}</td>
                <td className="num">
                  {canEdit && <IconButton icon={faTrash} label="Delete inflow" danger onClick={() => act(() => api.deleteInflow(i.id))} />}
                </td>
              </tr>
            ))}
            {inflows.data?.length === 0 && <tr><td colSpan={4} className="empty">No inflows yet</td></tr>}
          </tbody>
        </table>
      </TableBox>

      {monthly.length > 0 && (
        <BarsChart
          title={`${phase === "estimate" ? "Expected" : "Actual"} Cash Inflows Timeline`}
          data={monthly.map((m) => ({ month: month(m.month), inflow: m.totalCents }))}
          xKey="month"
          series={[{ key: "inflow", label: "Inflow" }]}
          height={240}
        />
      )}

      {monthly.length > 0 && (
        <TableBox title={`${phase === "estimate" ? "Expected" : "Actual"} cash inflows per month`}>
          <table className="data-table">
            <thead>
              <tr>
                <SortTh sort={byMonth} by="month">MONTH</SortTh>
                <SortTh sort={byMonth} by="inflow" className="num">{`${TITLE[phase]} INFLOW`}</SortTh>
                <th>CASH SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.sorted(monthly).map((m) => (
                <tr key={m.month}>
                  <td>{month(m.month)}</td>
                  <td className="num">{money(m.totalCents, true)}</td>
                  <td className="lines">{m.names.map((n) => <div key={n}>{n}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}
    </section>
  );
}
