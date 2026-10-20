import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Phase } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Button, IconButton } from "../components/Button";
import { date, money, moneyFromDecimal, month } from "../lib/format";
import { useAction } from "../lib/useAction";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

/** CASH FROM: the contracts of each fund, what is left of them, and who pays the VAT. */
export function FundsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>CASH FROM</h1>
          <p className="muted">Contracts per fund. A fund that does not pay the VAT leaves it to the team.</p>
        </div>
      </header>
      <div className="two-columns">
        <PhaseFunds phase="estimate" />
        <PhaseFunds phase="actual" />
      </div>
    </>
  );
}

function PhaseFunds({ phase }: { phase: Phase }) {
  const act = useAction();
  const contracts = useQuery({ queryKey: ["contracts", phase], queryFn: () => api.contracts(phase) });
  const summary = useQuery({ queryKey: ["funds-summary", phase], queryFn: () => api.fundsSummary(phase) });
  const funds = useQuery({ queryKey: ["funds"], queryFn: () => api.funds() });
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await act(() =>
      api.createContract({ phase, fundName: name.trim(), amount, inflowDate: day || null }),
    );
    if (ok) {
      setName("");
      setAmount("");
      setDay("");
    }
  };
  const flag = (fundId: number, paysVat: boolean) =>
    act(() => api.updateFund(fundId, phase === "estimate" ? { paysVatEstimate: paysVat } : { paysVatActual: paysVat }));

  return (
    <section className="panel">
      <h2>{TITLE[phase]}</h2>

      <form className="inline-form" onSubmit={add}>
        <div className="field">
          <label htmlFor={`fund-${phase}`}>Company</label>
          <input id={`fund-${phase}`} className="input small" list={`funds-${phase}`} value={name} onChange={(e) => setName(e.target.value)} />
          <datalist id={`funds-${phase}`}>
            {funds.data?.filter((f) => f.kind === "external").map((f) => <option key={f.id} value={f.name} />)}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor={`amount-${phase}`}>Contract value</label>
          <input id={`amount-${phase}`} className="input small" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`day-${phase}`}>Inflow date</label>
          <input id={`day-${phase}`} className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <Button small icon={faPlus} type="submit" disabled={name.trim() === "" || amount === ""}>Add contract</Button>
      </form>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>COMPANY</th><th className="num">CONTRACT VALUE</th><th>INFLOW DATE</th><th /></tr>
          </thead>
          <tbody>
            {contracts.data?.map((c) => (
              <tr key={c.id}>
                <td>{c.fundName}</td>
                <td className="num">{moneyFromDecimal(c.amount)}</td>
                <td>{date(c.inflowDate)}</td>
                <td className="num"><IconButton icon={faTrash} label="Delete contract" danger onClick={() => act(() => api.deleteContract(c.id))} /></td>
              </tr>
            ))}
            {contracts.data?.length === 0 && <tr><td colSpan={4} className="empty">No contracts yet</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>CASH SOURCE</th><th className="num">TOTAL CONTRACT</th><th className="num">LEFT VALUE</th><th>DOES IT PAY VAT?</th></tr>
          </thead>
          <tbody>
            {summary.data?.rows.map((row) => (
              <tr key={row.fundId}>
                <td>{row.name}</td>
                <td className="num">{money(row.totalContractCents)}</td>
                <td className={`num${row.leftCents < 0 ? " cell-negative" : ""}`}>{money(row.leftCents)}</td>
                <td>
                  <label className="checkbox">
                    <input type="checkbox" checked={row.paysVat} onChange={(e) => flag(row.fundId, e.target.checked)} />
                    {row.paysVat ? "yes" : "no: the team pays it"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.data && summary.data.monthly.length > 0 && (
        <BarsChart
          title={`${phase === "estimate" ? "Expected" : "Actual"} Cash Inflows Timeline`}
          data={summary.data.monthly.map((m) => ({ month: month(m.month), inflow: m.totalCents }))}
          xKey="month"
          series={[{ key: "inflow", label: "Inflow" }]}
          height={240}
        />
      )}

      {summary.data && summary.data.monthly.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>MONTH</th><th className="num">{phase === "estimate" ? "EXPECTED" : "ACTUAL"} INFLOW</th><th>CASH SOURCE</th></tr>
            </thead>
            <tbody>
              {summary.data.monthly.map((m) => (
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
