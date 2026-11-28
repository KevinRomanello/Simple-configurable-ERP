import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { budgetApi } from "./api";
import { platformApi } from "../../platform/api";
import type { Fund, NewContract } from "./types";
import type { FundSummaryRow, Phase } from "../../core/calcTypes";
import { IconButton } from "../../core/Button";
import { DraftNote } from "../../core/DraftNote";
import { CommitInput } from "../../core/CommitInput";
import { TableBox } from "../../core/ExportBlocks";
import { MonthlyChart, MonthlyTable } from "./MonthlyInflows";
import { PhasePair } from "./PhasePair";
import { SortTh } from "../../core/SortTh";
import { DataTable, EmptyRow, Field, FormPanel, PageHeader, Panel, Table, type Column } from "../../core/ui";
import { date, money, moneyFromDecimal } from "../../core/format";
import { givesBody, givesOf, hasMoney, type Gives } from "./gives";
import { useSort, type SortAccessors } from "../../core/sort";
import { useCanEditShared } from "../../platform/season";
import { useAction } from "../../core/useAction";
import { fieldSetter, useDraft } from "../../core/useDraft";

const TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

const TYPE_LABEL: Record<Gives, string> = {
  fund: "Gives a fund",
  unlimited: "Gives a fund, no limit",
  gift: "Gives goods, no VAT",
  gift_vat: "Gives goods, VAT on the counter-invoice",
};

/** The same, shorter, for the table of sponsors. */
const TYPE_SHORT: Record<Gives, string> = { fund: "Fund", unlimited: "Fund, no limit", gift: "Goods, no VAT", gift_vat: "Goods + VAT" };

/** CASH FROM: the sponsors, their contracts, what is left of them, and who pays the VAT. */
export function FundsPage() {
  const canEdit = useCanEditShared();

  return (
    <>
      <PageHeader
        title="CASH FROM"
        description="Sponsors and their contracts. Choose a sponsor in the budget and the VAT is worked out from how it is defined here."
        add={canEdit ? { label: "New sponsor", draftKey: "new-sponsor", form: (close) => <NewSponsor onDone={close} /> } : undefined}
      />
      <SponsorsPanel />
      <PhasePair title="What is left of each sponsor">{(phase) => <FundsLeft phase={phase} />}</PhasePair>
      <PhasePair title="Per month">{(phase) => <FundsMonthly phase={phase} />}</PhasePair>
      <PhasePair title="Timeline">{(phase) => <FundsMonthly phase={phase} chart />}</PhasePair>
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
/** What is written in the form that adds a sponsor. */
interface SponsorDraft {
  name: string;
  gives: Gives;
  rate: string;
  group: string;
  amount: string;
  day: string;
  counts: keyof typeof PHASES_CHOICE;
}

function NewSponsor({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const funds = useQuery({ queryKey: ["funds"], queryFn: () => budgetApi.funds() });
  const rates = useQuery({ queryKey: ["vat-rates"], queryFn: platformApi.vatRates });
  const fixedRates = useQuery({ queryKey: ["fixed-sponsor-rates"], queryFn: budgetApi.fixedSponsorRates });

  const [initial] = useState<SponsorDraft>({ name: "", gives: "fund", rate: "", group: "", amount: "", day: "", counts: "both" });
  const [form, setForm, saved] = useDraft<SponsorDraft>("new-sponsor", initial);
  const { name, gives, rate, group, amount, day, counts } = form;
  const set = fieldSetter(setForm);
  const [setName, setGives, setRate, setGroup, setAmount, setDay, setCounts] = [set("name"), set("gives"), set("rate"), set("group"), set("amount"), set("day"), set("counts")];

  // goods have a VAT rate that is not chosen (none, or the one of the counter-invoice): the server's
  const fixed = fixedRates.data?.[givesBody(gives).type];
  const isMoney = hasMoney(gives); // only a fund with a limit is a sum of money; goods and a fund with no limit have no contract
  const ready = name.trim() !== "" && (fixed !== undefined || rate !== "");

  const submit = async () => {
    const contracts: NewContract[] =
      isMoney && amount !== "" ? PHASES_CHOICE[counts].map((phase) => ({ phase, amount, inflowDate: day || null })) : [];
    const ok = await act(() =>
      budgetApi.createFund({ name: name.trim(), ...givesBody(gives), vatRate: fixed ?? Number(rate), group: group.trim() || null, contracts }),
    );
    if (ok) {
      saved.discard();
      onDone();
    }
  };

  return (
    <FormPanel
      title="New sponsor"
      description="A sponsor's fund pays what is chosen with it, VAT included at its VAT %: put 0% for a sponsor that pays no VAT. Goods without VAT are always 0%, goods with a counter-invoice always 11%, and a sponsor that gives goods is also added to BOUGHT FROM. Sponsors of the same group can pay one purchase together. Money that goes into the bank is not a sponsor: add it in CASH FLOW, as an inflow."
      submitLabel="Add sponsor"
      canSubmit={ready}
      onSubmit={submit}
      onCancel={() => saved.leave(onDone)}
      layout="stack"
    >
      <DraftNote draft={saved} />
      <div className="form-grid">
        <Field label="Name" htmlFor="sponsor-name">
          <input id="sponsor-name" className="input small" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Gives" htmlFor="sponsor-type">
          <select id="sponsor-type" className="input small" value={gives} onChange={(e) => setGives(e.target.value as Gives)}>
            {(Object.keys(TYPE_LABEL) as Gives[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="VAT %" htmlFor="sponsor-rate">
          <select id="sponsor-rate" className="input small" value={fixed !== undefined ? String(fixed) : rate} disabled={fixed !== undefined} onChange={(e) => setRate(e.target.value)}>
            {fixed === undefined && <option value="">Choose…</option>}
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
        <p className="muted">
          {gives === "unlimited"
            ? "A fund with no limit has no sum of money: you buy with it, and CASH FROM shows how much is expected to be spent (EXPECTED) and how much was spent (ACTUAL)."
            : "A sponsor that gives goods has no sum of money: nothing to add here. CASH FROM shows how much is expected to be spent with it (EXPECTED) and how much was spent (ACTUAL)."}
        </p>
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
  if (!hasMoney(givesOf(fund))) return <><td className="group-start" /><td /></>; // goods and a fund with no limit are not a sum of money

  const save = (amount: string, inflowDate: string | null) =>
    act(() => (amount === "" ? (money_ ? budgetApi.clearContract(fund.id, phase) : Promise.resolve()) : budgetApi.setContract(fund.id, phase, { amount, inflowDate })));

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
  type: (f) => TYPE_SHORT[givesOf(f)],
  vat: (f) => f.vatRate,
  group: (f) => f.group || null,
};

/** The definition of every sponsor and what it is worth, one row each, edited in place. */
function SponsorsPanel() {
  const act = useAction();
  const canEdit = useCanEditShared();
  const funds = useQuery({ queryKey: ["funds"], queryFn: () => budgetApi.funds() });
  const rates = useQuery({ queryKey: ["vat-rates"], queryFn: platformApi.vatRates });
  const fixedRates = useQuery({ queryKey: ["fixed-sponsor-rates"], queryFn: budgetApi.fixedSponsorRates });
  const sort = useSort(SPONSOR_SORT, { key: "name", direction: 1 });
  const sponsors = sort.sorted(funds.data?.filter((f) => f.kind === "external") ?? []);

  const change = (fund: Fund, body: Parameters<typeof budgetApi.updateFund>[1]) => act(() => budgetApi.updateFund(fund.id, body));
  const remove = (fund: Fund) => {
    if (window.confirm(`Delete the sponsor "${fund.name}" and its money?`)) void act(() => budgetApi.deleteFund(fund.id));
  };
  const rateOptions = (rates.data ?? []).map((r) => <option key={r} value={r}>{r}%</option>);

  return (
    // a header on two rows (the money of each phase): built from the common pieces rather than DataTable
    <Panel title="SPONSORS">
      <TableBox title="Sponsors">
        <Table>
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
                    <select className="input small" aria-label={`What ${f.name} gives`} value={givesOf(f)} onChange={(e) => change(f, givesBody(e.target.value as Gives))}>
                      {(Object.keys(TYPE_SHORT) as Gives[]).map((t) => <option key={t} value={t}>{TYPE_SHORT[t]}</option>)}
                    </select>
                  ) : TYPE_SHORT[givesOf(f)]}
                </td>
                <td>
                  {canEdit && fixedRates.data && fixedRates.data[f.type] === undefined ? (
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
        </Table>
      </TableBox>
      <GroupSuggestions funds={funds.data ?? []} />
    </Panel>
  );
}

// A fund with no limit has no sum behind it (a null total and left): it says so, and only what was spent counts.
const SUMMARY_COLUMNS: Column<FundSummaryRow>[] = [
  { key: "name", header: "CASH SOURCE", sort: (r) => r.name, cell: (r) => r.name },
  { key: "contract", header: "TOTAL CONTRACT", num: true, sort: (r) => r.totalContractCents, cell: (r) => (r.totalContractCents === null ? "no limit" : money(r.totalContractCents)) },
  { key: "spent", header: "SPENT", num: true, sort: (r) => r.outflowCents, cell: (r) => money(r.outflowCents) },
  {
    key: "left",
    header: "LEFT VALUE",
    num: true,
    className: "sum",
    sort: (r) => r.leftCents,
    cellClass: (r) => (r.leftCents !== null && r.leftCents < 0 ? "cell-negative" : undefined),
    cell: (r) => (r.leftCents === null ? "" : money(r.leftCents)),
  },
];

/** What the sponsors' money comes to in a phase: what is left of each fund. */
function FundsLeft({ phase }: { phase: Phase }) {
  const summary = useQuery({ queryKey: ["funds-summary", phase], queryFn: () => budgetApi.fundsSummary(phase) });
  return <DataTable title={`${TITLE[phase]} cash left per sponsor`} columns={SUMMARY_COLUMNS} rows={summary.data?.rows} rowKey={(r) => r.fundId} />;
}

/** When the sponsors' money arrives in a phase, as a table or as a chart (the same query: it is asked once). */
function FundsMonthly({ phase, chart = false }: { phase: Phase; chart?: boolean }) {
  const summary = useQuery({ queryKey: ["funds-summary", phase], queryFn: () => budgetApi.fundsSummary(phase) });
  const monthly = summary.data?.monthly ?? [];
  return chart ? <MonthlyChart phase={phase} monthly={monthly} /> : <MonthlyTable phase={phase} monthly={monthly} />;
}
