import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Phase } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Button, IconButton } from "../components/Button";
import { MoneyCard } from "../components/Cards";
import { date, money, moneyFromDecimal, month } from "../lib/format";
import { useAction } from "../lib/useAction";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

/** CASH FLOW: the BANK balance, the money coming in, and what is left after the team's spending. */
export function CashFlowPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>CASH FLOW</h1>
          <p className="muted">
            Left value = BANK + inflows after the BANK date − the team's purchases and VAT after that date.
          </p>
        </div>
      </header>
      <BankBox />
      <div className="two-columns">
        <PhaseCashFlow phase="estimate" />
        <PhaseCashFlow phase="actual" />
      </div>
    </>
  );
}

function BankBox() {
  const act = useAction();
  const bank = useQuery({ queryKey: ["bank"], queryFn: api.bank });
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");

  useEffect(() => {
    setAmount(bank.data?.amount ?? "");
    setDay(bank.data?.asOfDate ?? "");
  }, [bank.data]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    void act(() => api.setBank({ amount, asOfDate: day || null }));
  };

  return (
    <section className="panel">
      <h2>BANK</h2>
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
        <Button small variant="ghost" disabled={!bank.data} onClick={() => act(() => api.clearBank())}>Clear</Button>
      </form>
    </section>
  );
}

function PhaseCashFlow({ phase }: { phase: Phase }) {
  const act = useAction();
  const inflows = useQuery({ queryKey: ["inflows", phase], queryFn: () => api.inflows(phase) });
  const view = useQuery({ queryKey: ["cashflow"], queryFn: api.cashFlow });
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await act(() => api.createInflow({ phase, sourceName: name.trim(), amount, inflowDate: day || null }));
    if (ok) {
      setName("");
      setAmount("");
      setDay("");
    }
  };

  const summary = view.data?.[phase].summary;
  const monthly = view.data?.[phase].monthly ?? [];

  return (
    <section className="panel">
      <h2>{TITLE[phase]}</h2>

      {summary && (
        <div className="cards">
          <MoneyCard caption="Total cash flow" cents={summary.totalCashFlowCents} />
          <MoneyCard caption="Left value" cents={summary.leftValueCents} />
          <MoneyCard caption="Left value − cash from" cents={summary.leftAfterCoverageCents} />
        </div>
      )}

      <form className="inline-form" onSubmit={add}>
        <div className="field">
          <label htmlFor={`inflow-name-${phase}`}>Company</label>
          <input id={`inflow-name-${phase}`} className="input small" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`inflow-amount-${phase}`}>Contract value</label>
          <input id={`inflow-amount-${phase}`} className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`inflow-day-${phase}`}>Inflow date</label>
          <input id={`inflow-day-${phase}`} className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <Button small icon={faPlus} type="submit" disabled={name.trim() === "" || amount === ""}>Add inflow</Button>
      </form>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>COMPANY</th><th className="num">CONTRACT VALUE</th><th>INFLOW DATE</th><th /></tr>
          </thead>
          <tbody>
            {inflows.data?.map((i) => (
              <tr key={i.id}>
                <td>{i.sourceName}</td>
                <td className="num">{moneyFromDecimal(i.amount)}</td>
                <td>{date(i.inflowDate)}</td>
                <td className="num"><IconButton icon={faTrash} label="Delete inflow" danger onClick={() => act(() => api.deleteInflow(i.id))} /></td>
              </tr>
            ))}
            {inflows.data?.length === 0 && <tr><td colSpan={4} className="empty">No inflows yet</td></tr>}
          </tbody>
        </table>
      </div>

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
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>MONTH</th><th className="num">{TITLE[phase]} INFLOW</th><th>CASH SOURCE</th></tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td>{month(m.month)}</td>
                  <td className="num">{money(m.totalCents, true)}</td>
                  <td>{m.names.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
