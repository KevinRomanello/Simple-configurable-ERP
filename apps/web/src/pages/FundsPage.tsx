import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Fund, FundMode, FundSummaryRow, FundType, MonthlyInflow, NewContract, Phase } from "../api/types";
import { BarsChart } from "../components/BarsChart";
import { Button, IconButton } from "../components/Button";
import { date, money, moneyFromDecimal, month } from "../lib/format";
import { useMe } from "../lib/auth";
import { useAction } from "../lib/useAction";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

const MODE_LABEL: Record<FundMode, string> = { virtual: "Virtual", cash: "Team's fund" };
const TYPE_LABEL: Record<FundType, string> = {
  fund: "Gives a fund",
  gift: "Gives goods, no VAT",
  gift_vat: "Gives goods, VAT on the counter-invoice",
};

/** The same, shorter, for the table of sponsors. */
const TYPE_SHORT: Record<FundType, string> = { fund: "Fund", gift: "Goods, no VAT", gift_vat: "Goods + VAT" };

/** CASH FROM: the sponsors, their contracts, what is left of them, and who pays the VAT. */
export function FundsPage() {
  const canEdit = useMe().permissions.canEditShared;
  const [adding, setAdding] = useState(false);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>CASH FROM</h1>
          <p className="muted">
            Sponsors and their contracts. Choose a sponsor in the budget and the VAT is worked out from how it is defined here.
          </p>
        </div>
        <div className="actions">
          {canEdit && <Button icon={faPlus} onClick={() => setAdding(!adding)}>{adding ? "Close" : "New sponsor"}</Button>}
          <DownloadMenu />
        </div>
      </header>

      {adding && <NewSponsor onDone={() => setAdding(false)} />}
      <SponsorsPanel />
      <div className="two-columns">
        <PhaseSummary phase="estimate" />
        <PhaseSummary phase="actual" />
      </div>
    </>
  );
}

/** A text box that saves when it loses focus (or on Enter) and only if the text changed. */
function CommitInput({ value, label, list, wide, onCommit }: { value: string; label: string; list?: string; wide?: boolean; onCommit: (text: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() !== value) onCommit(text.trim());
    else setText(value);
  };
  return (
    <input
      className={`input small${wide ? " wide" : ""}`}
      value={text}
      list={list}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

const rateLabel = (rate: number | null) => (rate === null ? "" : `${rate}%`);

/** The groups already in use, offered while a group is typed. */
const GROUPS_LIST = "sponsor-groups";
function GroupSuggestions({ funds }: { funds: Fund[] }) {
  const groups = [...new Set(funds.flatMap((f) => (f.group ? [f.group] : [])))];
  return <datalist id={GROUPS_LIST}>{groups.map((g) => <option key={g} value={g} />)}</datalist>;
}

const PHASES_CHOICE = {
  both: ["estimate", "actual"],
  estimate: ["estimate"],
  actual: ["actual"],
} as const satisfies Record<string, readonly Phase[]>;

/** The form of a new sponsor: how it works and the money it brings. It opens from the button at the top. */
function NewSponsor({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const funds = useQuery({ queryKey: ["funds"], queryFn: () => api.funds() });
  const rates = useQuery({ queryKey: ["vat-rates"], queryFn: api.vatRates });

  const [name, setName] = useState("");
  const [mode, setMode] = useState<FundMode>("virtual");
  const [type, setType] = useState<FundType>("fund");
  const [rate, setRate] = useState("");
  const [group, setGroup] = useState("");
  const [paysVat, setPaysVat] = useState(false);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [counts, setCounts] = useState<keyof typeof PHASES_CHOICE>("both");

  const gift = type === "gift";
  const isMoney = type === "fund"; // only a fund is a sum of money; goods have no contract
  const ready = name.trim() !== "" && (gift || rate !== "");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const contracts: NewContract[] =
      isMoney && amount !== "" ? PHASES_CHOICE[counts].map((phase) => ({ phase, amount, inflowDate: day || null })) : [];
    const ok = await act(() =>
      api.createFund({ name: name.trim(), mode, type, vatRate: gift ? 0 : Number(rate), group: group.trim() || null, paysVat, contracts }),
    );
    if (ok) onDone();
  };

  return (
    <section className="panel">
      <h2>New sponsor</h2>
      <p className="muted">
        <strong>Virtual</strong>: the money does not reach the bank; the VAT of the purchases is paid by the team unless
        the sponsor pays it. <strong>Team's fund</strong>: the money is paid into the bank, and the team owes 11% VAT on it
        every quarter. Sponsors of the same group can pay one purchase together.
      </p>
      <form className="stack tight" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="sponsor-name">Name</label>
            <input id="sponsor-name" className="input small" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sponsor-mode">Money goes to</label>
            <select
              id="sponsor-mode"
              className="input small"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as FundMode);
                if (e.target.value === "cash") setType("fund"); // goods never go through the bank
              }}
            >
              {(Object.keys(MODE_LABEL) as FundMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sponsor-type">Gives</label>
            <select id="sponsor-type" className="input small" value={type} disabled={mode === "cash"} onChange={(e) => setType(e.target.value as FundType)}>
              {(Object.keys(TYPE_LABEL) as FundType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sponsor-rate">VAT %</label>
            <select id="sponsor-rate" className="input small" value={gift ? "0" : rate} disabled={gift} onChange={(e) => setRate(e.target.value)}>
              {!gift && <option value="">Choose…</option>}
              {(rates.data ?? []).map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sponsor-group">Group (optional)</label>
            <input id="sponsor-group" className="input small" list={GROUPS_LIST} maxLength={60} value={group} onChange={(e) => setGroup(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Pays VAT</span>
            <label className="checkbox"><input type="checkbox" checked={paysVat} onChange={(e) => setPaysVat(e.target.checked)} />The fund covers the VAT too</label>
          </div>
        </div>

        {isMoney ? (
          <div className="subsection">
            <h3>The money of the fund</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="sponsor-amount">Contract value</label>
                <input id="sponsor-amount" className="input small" type="number" min="0" step="0.01" placeholder="Optional" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="sponsor-day">Arrives on</label>
                <input id="sponsor-day" className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="sponsor-counts">Counts in</label>
                <select id="sponsor-counts" className="input small" value={counts} onChange={(e) => setCounts(e.target.value as keyof typeof PHASES_CHOICE)}>
                  <option value="both">EXPECTED and ACTUAL</option>
                  <option value="estimate">EXPECTED only</option>
                  <option value="actual">ACTUAL only</option>
                </select>
              </div>
            </div>
            <p className="muted">Value and date can be changed later in the SPONSORS table.</p>
          </div>
        ) : (
          <p className="muted">A sponsor that gives goods has no sum of money: nothing to add here.</p>
        )}

        <div className="actions">
          <Button type="submit" disabled={!ready}>Add sponsor</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </form>
      <GroupSuggestions funds={funds.data ?? []} />
    </section>
  );
}

/** A number box that saves when it loses focus (or on Enter) and only if the amount changed. */
function AmountInput({ value, label, onCommit }: { value: string; label: string; onCommit: (amount: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() === "" ? value !== "" : Number(text) !== Number(value)) onCommit(text.trim());
    else setText(value);
  };
  return (
    <input
      className="input small"
      type="number"
      min="0"
      step="0.01"
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/**
 * The money a sponsor brings in one phase: its value and the day it arrives, two cells of the
 * sponsor's row. A blank value takes the money away; the date needs a value first.
 */
function MoneyCells({ fund, phase, canEdit }: { fund: Fund; phase: Phase; canEdit: boolean }) {
  const act = useAction();
  const money_ = fund.contracts[phase];
  if (fund.type !== "fund") return <><td className="group-start" /><td /></>; // goods are not a sum of money

  const save = (amount: string, inflowDate: string | null) =>
    act(() => (amount === "" ? (money_ ? api.clearContract(fund.id, phase) : Promise.resolve()) : api.setContract(fund.id, phase, { amount, inflowDate })));

  if (!canEdit) {
    return (
      <>
        <td className="num group-start">{money_ ? moneyFromDecimal(money_.amount) : ""}</td>
        <td>{money_ ? date(money_.inflowDate) : ""}</td>
      </>
    );
  }
  const who = `${TITLE[phase].toLowerCase()} of ${fund.name}`;
  return (
    <>
      <td className="num group-start">
        <AmountInput value={money_?.amount ?? ""} label={`Value ${who}`} onCommit={(amount) => save(amount, money_?.inflowDate ?? null)} />
      </td>
      <td>
        <input
          className="input small"
          type="date"
          value={money_?.inflowDate ?? ""}
          disabled={!money_}
          aria-label={`Arrives ${who}`}
          onChange={(e) => money_ && save(money_.amount, e.target.value || null)}
        />
      </td>
    </>
  );
}

/** What the table of sponsors can be sorted by: each header that is a column of values. */
const SPONSOR_SORT: SortAccessors<Fund> = {
  name: (f) => f.name,
  estimateValue: (f) => (f.contracts.estimate ? Number(f.contracts.estimate.amount) : null),
  actualValue: (f) => (f.contracts.actual ? Number(f.contracts.actual.amount) : null),
  estimateDate: (f) => f.contracts.estimate?.inflowDate ?? null,
  actualDate: (f) => f.contracts.actual?.inflowDate ?? null,
  mode: (f) => MODE_LABEL[f.mode],
  type: (f) => TYPE_SHORT[f.type],
  vat: (f) => f.vatRate,
  group: (f) => f.group || null,
  paysVat: (f) => (f.paysVat ? 1 : 0),
};

/** The definition of every sponsor and what it is worth, one row each, edited in place. */
function SponsorsPanel() {
  const act = useAction();
  const canEdit = useMe().permissions.canEditShared;
  const funds = useQuery({ queryKey: ["funds"], queryFn: () => api.funds() });
  const rates = useQuery({ queryKey: ["vat-rates"], queryFn: api.vatRates });
  const sort = useSort(SPONSOR_SORT, { key: "name", direction: 1 });
  const sponsors = sort.sorted(funds.data?.filter((f) => f.kind === "external") ?? []);

  const change = (fund: Fund, body: Parameters<typeof api.updateFund>[1]) => act(() => api.updateFund(fund.id, body));
  const remove = (fund: Fund) => {
    if (window.confirm(`Delete the sponsor "${fund.name}" and its money?`)) void act(() => api.deleteFund(fund.id));
  };
  const rateOptions = (rates.data ?? []).map((r) => <option key={r} value={r}>{r}%</option>);

  return (
    <section className="panel">
      <h2>SPONSORS</h2>
      <TableBox title="Sponsors">
        <table className="data-table">
          <thead>
            <tr>
              <SortTh sort={sort} by="name" rowSpan={2}>NAME</SortTh>
              <th colSpan={2} className="group-start">EXPECTED</th><th colSpan={2} className="group-start">ACTUAL</th>
              <SortTh sort={sort} by="mode" rowSpan={2} className="group-start">MONEY GOES TO</SortTh>
              <SortTh sort={sort} by="type" rowSpan={2}>GIVES</SortTh>
              <SortTh sort={sort} by="vat" rowSpan={2}>VAT %</SortTh>
              <SortTh sort={sort} by="group" rowSpan={2}>GROUP</SortTh>
              <SortTh sort={sort} by="paysVat" rowSpan={2}>PAYS VAT</SortTh>
              <th rowSpan={2} />
            </tr>
            <tr>
              <SortTh sort={sort} by="estimateValue" className="num group-start">VALUE</SortTh>
              <SortTh sort={sort} by="estimateDate">ARRIVES</SortTh>
              <SortTh sort={sort} by="actualValue" className="num group-start">VALUE</SortTh>
              <SortTh sort={sort} by="actualDate">ARRIVES</SortTh>
            </tr>
          </thead>
          <tbody>
            {sponsors.map((f) => (
              <tr key={f.id}>
                <td>{canEdit ? <CommitInput wide value={f.name} label={`Name of ${f.name}`} onCommit={(text) => text !== "" && change(f, { name: text })} /> : f.name}</td>
                <MoneyCells fund={f} phase="estimate" canEdit={canEdit} />
                <MoneyCells fund={f} phase="actual" canEdit={canEdit} />
                <td className="group-start">
                  {canEdit ? (
                    <select className="input small" aria-label={`Money of ${f.name}`} value={f.mode} onChange={(e) => change(f, { mode: e.target.value as FundMode })}>
                      {(Object.keys(MODE_LABEL) as FundMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                  ) : MODE_LABEL[f.mode]}
                </td>
                <td>
                  {canEdit ? (
                    <select className="input small" aria-label={`What ${f.name} gives`} value={f.type} disabled={f.mode === "cash"} onChange={(e) => change(f, { type: e.target.value as FundType })}>
                      {(Object.keys(TYPE_SHORT) as FundType[]).map((t) => <option key={t} value={t}>{TYPE_SHORT[t]}</option>)}
                    </select>
                  ) : TYPE_SHORT[f.type]}
                </td>
                <td>
                  {canEdit && f.type !== "gift" ? (
                    <select className="input small" aria-label={`VAT rate of ${f.name}`} value={f.vatRate ?? ""} onChange={(e) => change(f, { vatRate: Number(e.target.value) })}>
                      {rateOptions}
                    </select>
                  ) : rateLabel(f.vatRate)}
                </td>
                <td>{canEdit ? <CommitInput value={f.group ?? ""} label={`Group of ${f.name}`} list={GROUPS_LIST} onCommit={(text) => change(f, { group: text || null })} /> : f.group}</td>
                <td>
                  <input type="checkbox" aria-label={`${f.name} pays VAT`} checked={f.paysVat} disabled={!canEdit} onChange={(e) => change(f, { paysVat: e.target.checked })} />
                </td>
                <td className="num">{canEdit && <IconButton icon={faTrash} label="Delete sponsor" danger onClick={() => remove(f)} />}</td>
              </tr>
            ))}
            {sponsors.length === 0 && <tr><td colSpan={11} className="empty">No sponsors yet</td></tr>}
          </tbody>
        </table>
      </TableBox>
      <GroupSuggestions funds={funds.data ?? []} />
    </section>
  );
}

/** What the sponsors' money comes to in a phase: what is left of each fund and when the money arrives. */
const SUMMARY_SORT: SortAccessors<FundSummaryRow> = {
  name: (r) => r.name,
  contract: (r) => r.totalContractCents,
  left: (r) => r.leftCents,
};
const MONTHLY_SORT: SortAccessors<MonthlyInflow> = {
  month: (m) => m.month,
  inflow: (m) => m.totalCents,
};

function PhaseSummary({ phase }: { phase: Phase }) {
  const summary = useQuery({ queryKey: ["funds-summary", phase], queryFn: () => api.fundsSummary(phase) });
  const bySource = useSort(SUMMARY_SORT);
  const byMonth = useSort(MONTHLY_SORT);

  return (
    <section className="panel">
      <h2>{TITLE[phase]}</h2>

      <TableBox title={`${TITLE[phase]} cash left per sponsor`}>
        <table className="data-table">
          <thead>
            <tr>
              <SortTh sort={bySource} by="name">CASH SOURCE</SortTh>
              <SortTh sort={bySource} by="contract" className="num">TOTAL CONTRACT</SortTh>
              <SortTh sort={bySource} by="left" className="num sum">LEFT VALUE</SortTh>
            </tr>
          </thead>
          <tbody>
            {bySource.sorted(summary.data?.rows ?? []).map((row) => (
              <tr key={row.fundId}>
                <td>{row.name}</td>
                <td className="num">{money(row.totalContractCents)}</td>
                <td className={`num sum${row.leftCents < 0 ? " cell-negative" : ""}`}>{money(row.leftCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>

      {summary.data && summary.data.monthly.length > 0 && (
        <BarsChart
          title={`${phase === "estimate" ? "Expected" : "Actual"} Cash Inflows Timeline`}
          data={byMonth.sorted(summary.data.monthly).map((m) => ({ month: month(m.month), inflow: m.totalCents }))}
          xKey="month"
          series={[{ key: "inflow", label: "Inflow" }]}
          height={240}
        />
      )}

      {summary.data && summary.data.monthly.length > 0 && (
        <TableBox title={`${phase === "estimate" ? "Expected" : "Actual"} cash inflows per month`}>
          <table className="data-table">
            <thead>
              <tr>
                <SortTh sort={byMonth} by="month">MONTH</SortTh>
                <SortTh sort={byMonth} by="inflow" className="num">{`${phase === "estimate" ? "EXPECTED" : "ACTUAL"} INFLOW`}</SortTh>
                <th>CASH SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.sorted(summary.data.monthly).map((m) => (
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
