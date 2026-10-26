import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Fund, FundSummaryRow, FundType, NewContract, Phase } from "../api/types";
import { IconButton } from "../components/Button";
import { CommitInput } from "../components/CommitInput";
import { TableBox } from "../components/ExportBlocks";
import { MonthlyInflows } from "../components/MonthlyInflows";
import { SortTh } from "../components/SortTh";
import { DataTable, EmptyRow, Field, FormPanel, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { date, money, moneyFromDecimal } from "../lib/format";
import { useSort, type SortAccessors } from "../lib/sort";
import { useAction } from "../lib/useAction";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

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

  return (
    <>
      <PageHeader
        title="CASH FROM"
        description="Sponsors and their contracts. Choose a sponsor in the budget and the VAT is worked out from how it is defined here."
        add={canEdit ? { label: "New sponsor", form: (close) => <NewSponsor onDone={close} /> } : undefined}
      />
      <SponsorsPanel />
      <div className="two-columns">
        <PhaseSummary phase="estimate" />
        <PhaseSummary phase="actual" />
      </div>
    </>
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
  const [type, setType] = useState<FundType>("fund");
  const [rate, setRate] = useState("");
  const [group, setGroup] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [counts, setCounts] = useState<keyof typeof PHASES_CHOICE>("both");

  const gift = type === "gift";
  const isMoney = type === "fund"; // only a fund is a sum of money; goods have no contract
  const ready = name.trim() !== "" && (gift || rate !== "");

  const submit = async () => {
    const contracts: NewContract[] =
      isMoney && amount !== "" ? PHASES_CHOICE[counts].map((phase) => ({ phase, amount, inflowDate: day || null })) : [];
    const ok = await act(() =>
      api.createFund({ name: name.trim(), type, vatRate: gift ? 0 : Number(rate), group: group.trim() || null, contracts }),
    );
    if (ok) onDone();
  };

  return (
    <FormPanel
      title="New sponsor"
      description="A sponsor's fund pays what is chosen with it, VAT included at its VAT %: put 0% for a sponsor that pays no VAT. Sponsors of the same group can pay one purchase together. Money that goes into the bank is not a sponsor: add it in CASH FLOW, as an inflow."
      submitLabel="Add sponsor"
      canSubmit={ready}
      onSubmit={submit}
      onCancel={onDone}
      layout="stack"
    >
      <div className="form-grid">
        <Field label="Name" htmlFor="sponsor-name">
          <input id="sponsor-name" className="input small" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Gives" htmlFor="sponsor-type">
          <select id="sponsor-type" className="input small" value={type} onChange={(e) => setType(e.target.value as FundType)}>
            {(Object.keys(TYPE_LABEL) as FundType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="VAT %" htmlFor="sponsor-rate">
          <select id="sponsor-rate" className="input small" value={gift ? "0" : rate} disabled={gift} onChange={(e) => setRate(e.target.value)}>
            {!gift && <option value="">Choose…</option>}
            {(rates.data ?? []).map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
        </Field>
        <Field label="Group (optional)" htmlFor="sponsor-group">
          <input id="sponsor-group" className="input small" list={GROUPS_LIST} maxLength={60} value={group} onChange={(e) => setGroup(e.target.value)} />
        </Field>
      </div>

      {isMoney ? (
        <div className="subsection">
          <h3>The money of the fund</h3>
          <div className="form-grid">
            <Field label="Contract value" htmlFor="sponsor-amount">
              <input id="sponsor-amount" className="input small" type="number" min="0" step="0.01" placeholder="Optional" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Arrives on" htmlFor="sponsor-day">
              <input id="sponsor-day" className="input small" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Counts in" htmlFor="sponsor-counts">
              <select id="sponsor-counts" className="input small" value={counts} onChange={(e) => setCounts(e.target.value as keyof typeof PHASES_CHOICE)}>
                <option value="both">EXPECTED and ACTUAL</option>
                <option value="estimate">EXPECTED only</option>
                <option value="actual">ACTUAL only</option>
              </select>
            </Field>
          </div>
          <p className="muted">Value and date can be changed later in the SPONSORS table.</p>
        </div>
      ) : (
        <p className="muted">A sponsor that gives goods has no sum of money: nothing to add here.</p>
      )}
      <GroupSuggestions funds={funds.data ?? []} />
    </FormPanel>
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
  type: (f) => TYPE_SHORT[f.type],
  vat: (f) => f.vatRate,
  group: (f) => f.group || null,
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
    // a header on two rows (the money of each phase): built from the common pieces rather than DataTable
    <Panel title="SPONSORS">
      <TableBox title="Sponsors">
        <table className="data-table">
          <thead>
            <tr>
              <SortTh sort={sort} by="name" rowSpan={2}>NAME</SortTh>
              <th colSpan={2} className="group-start">EXPECTED</th><th colSpan={2} className="group-start">ACTUAL</th>
              <SortTh sort={sort} by="type" rowSpan={2} className="group-start">GIVES</SortTh>
              <SortTh sort={sort} by="vat" rowSpan={2}>VAT %</SortTh>
              <SortTh sort={sort} by="group" rowSpan={2}>GROUP</SortTh>
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
                    <select className="input small" aria-label={`What ${f.name} gives`} value={f.type} onChange={(e) => change(f, { type: e.target.value as FundType })}>
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
                <td className="num">{canEdit && <IconButton icon={faTrash} label="Delete sponsor" danger onClick={() => remove(f)} />}</td>
              </tr>
            ))}
            {funds.isSuccess && sponsors.length === 0 && <EmptyRow colSpan={9}>No sponsors yet</EmptyRow>}
          </tbody>
        </table>
      </TableBox>
      <GroupSuggestions funds={funds.data ?? []} />
    </Panel>
  );
}

const SUMMARY_COLUMNS: Column<FundSummaryRow>[] = [
  { key: "name", header: "CASH SOURCE", sort: (r) => r.name, cell: (r) => r.name },
  { key: "contract", header: "TOTAL CONTRACT", num: true, sort: (r) => r.totalContractCents, cell: (r) => money(r.totalContractCents) },
  {
    key: "left",
    header: "LEFT VALUE",
    num: true,
    className: "sum",
    sort: (r) => r.leftCents,
    cellClass: (r) => (r.leftCents < 0 ? "cell-negative" : undefined),
    cell: (r) => money(r.leftCents),
  },
];

/** What the sponsors' money comes to in a phase: what is left of each fund and when the money arrives. */
function PhaseSummary({ phase }: { phase: Phase }) {
  const summary = useQuery({ queryKey: ["funds-summary", phase], queryFn: () => api.fundsSummary(phase) });
  return (
    <Panel title={TITLE[phase]}>
      <DataTable title={`${TITLE[phase]} cash left per sponsor`} columns={SUMMARY_COLUMNS} rows={summary.data?.rows} rowKey={(r) => r.fundId} />
      <MonthlyInflows phase={phase} monthly={summary.data?.monthly ?? []} />
    </Panel>
  );
}
