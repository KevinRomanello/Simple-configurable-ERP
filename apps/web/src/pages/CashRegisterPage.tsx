import { faCheck, faFileExcel, faLink, faPen, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { api } from "../api/client";
import type { CashAccount, CashEntryBody, CashEntryRow, CashListItem, CashRegister } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { CashImport } from "../components/CashImport";
import { Chips } from "../components/Chips";
import { PayLines } from "../components/PayLines";
import { CommitInput } from "../components/CommitInput";
import { TableBox } from "../components/ExportBlocks";
import { SearchSelect } from "../components/SearchSelect";
import { Cards, Field, FormPanel, Loading, Message, MoneyCard, PageHeader, Panel } from "../components/ui";
import { useMe } from "../lib/auth";
import { date, money } from "../lib/format";
import { decimalText } from "../lib/lineEdit";
import { todayIso } from "../lib/today";
import { useAction } from "../lib/useAction";

// The register of the team's money, as the treasury's sheet: every movement of Cassa, Banca and
// Paypal with the balances after it. The row at the top types a new movement; the pencil of a row
// changes it. Not designed in Figma: the tables of the site. docs/registro-di-cassa.md

const ACCOUNTS: { value: CashAccount; label: string }[] = [
  { value: "cash", label: "CASSA" },
  { value: "bank", label: "BANCA" },
  { value: "paypal", label: "PAYPAL" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What the boxes of a movement hold, as typed: the ids are texts, the amount is positive. */
interface Draft {
  on: string;
  description: string;
  categoryId: string;
  methodId: string;
  account: CashAccount;
  direction: "in" | "out";
  amount: string;
  invoiceChecked: boolean;
  sponsorship: boolean;
}

const newDraft = (on: string, account: CashAccount): Draft => ({
  on, description: "", categoryId: "", methodId: "", account, direction: "out", amount: "", invoiceChecked: false, sponsorship: false,
});

const draftOf = (e: CashEntryRow): Draft => ({
  on: e.on,
  description: e.description,
  categoryId: e.categoryId === null ? "" : String(e.categoryId),
  methodId: e.methodId === null ? "" : String(e.methodId),
  account: e.account,
  direction: e.cents > 0 ? "in" : "out",
  amount: decimalText(Math.abs(e.cents), 2),
  invoiceChecked: e.invoiceChecked,
  sponsorship: e.sponsorship,
});

const bodyOf = (d: Draft): CashEntryBody => ({
  on: d.on,
  description: d.description.trim(),
  categoryId: d.categoryId === "" ? null : Number(d.categoryId),
  methodId: d.methodId === "" ? null : Number(d.methodId),
  account: d.account,
  direction: d.direction,
  amount: d.amount,
  invoiceChecked: d.invoiceChecked,
  sponsorship: d.direction === "in" && d.sponsorship,
});

const complete = (d: Draft) => d.on !== "" && Number(d.amount) > 0;

/** The boxes of one movement in the cells of a row: the row of a new movement, and a row being changed. */
function EntryCells({ draft, onChange, onSave, onCancel, categories, methods, idPrefix }: {
  draft: Draft;
  onChange: (change: Partial<Draft>) => void;
  onSave: () => void;
  onCancel?: () => void;
  categories: CashListItem[];
  methods: CashListItem[];
  idPrefix: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const choose = (categoryId: string) => {
    const voce = categories.find((c) => String(c.id) === categoryId);
    // the Voce can say that money in on it is sponsorship; the box of the row stays the person's to change
    onChange({ categoryId, ...(draft.direction === "in" && voce ? { sponsorship: voce.sponsorship === true } : {}) });
  };
  const enter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && complete(draft)) onSave();
    if (event.key === "Escape") onCancel?.();
  };
  return (
    <>
      <td><input id={id("on")} className="input small" type="date" aria-label="Data" min="2000-01-01" max="2100-12-31" value={draft.on} onChange={(e) => onChange({ on: e.target.value })} onKeyDown={enter} /></td>
      <td><input id={id("description")} className="input small" aria-label="Descrizione" maxLength={500} value={draft.description} onChange={(e) => onChange({ description: e.target.value })} onKeyDown={enter} /></td>
      <td>
        <SearchSelect id={id("voce")} label="Voce" value={draft.categoryId} onChange={choose} choices={[{ value: "", label: "—" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]} />
      </td>
      <td>
        <select id={id("method")} className="input small" aria-label="Metodo di pagamento" value={draft.methodId} onChange={(e) => onChange({ methodId: e.target.value })}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </td>
      <td><input type="checkbox" aria-label="Check fattura" checked={draft.invoiceChecked} onChange={(e) => onChange({ invoiceChecked: e.target.checked })} /></td>
      <td><input type="checkbox" aria-label="Sponsorship" disabled={draft.direction === "out"} checked={draft.direction === "in" && draft.sponsorship} onChange={(e) => onChange({ sponsorship: e.target.checked })} /></td>
      <td colSpan={9} className="group-start">
        <div className="inline-form">
          <select className="input small" aria-label="Conto" value={draft.account} onChange={(e) => onChange({ account: e.target.value as CashAccount })}>
            {ACCOUNTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select className="input small" aria-label="Entrata o uscita" value={draft.direction} onChange={(e) => onChange({ direction: e.target.value as "in" | "out", ...(e.target.value === "out" ? { sponsorship: false } : {}) })}>
            <option value="in">Entrate</option>
            <option value="out">Uscite</option>
          </select>
          <input id={id("amount")} className="input small" type="number" aria-label="Importo" min="0" step="0.01" placeholder="0,00" value={draft.amount} onChange={(e) => onChange({ amount: e.target.value })} onKeyDown={enter} />
          <Button small icon={faCheck} disabled={!complete(draft)} onClick={onSave}>{onCancel ? "Save" : "Add"}</Button>
          {onCancel && <IconButton icon={faXmark} label="Cancel" onClick={onCancel} />}
        </div>
      </td>
      <td />
    </>
  );
}

/** The form of a new movement, opened by the yellow button of the header; it stays open so that a batch can be typed, keeping the day and the account. */
function NewMovement({ categories, methods, onClose }: { categories: CashListItem[]; methods: CashListItem[]; onClose: () => void }) {
  const act = useAction();
  const [draft, setDraft] = useState<Draft>(() => newDraft(todayIso(), "bank"));
  const [last, setLast] = useState("");
  const change = (part: Partial<Draft>) => setDraft((d) => ({ ...d, ...part }));
  const choose = (categoryId: string) => {
    const voce = categories.find((c) => String(c.id) === categoryId);
    // the Voce can say that money in on it is sponsorship; the box stays the person's to change
    change({ categoryId, ...(draft.direction === "in" && voce ? { sponsorship: voce.sponsorship === true } : {}) });
  };
  const add = async () => {
    if (await act(() => api.createCashEntry(bodyOf(draft)))) {
      setLast(`Added: ${draft.description.trim() || "movement"}, ${draft.direction === "in" ? "Entrate" : "Uscite"} ${draft.amount} (${ACCOUNTS.find((a) => a.value === draft.account)?.label})`);
      setDraft(newDraft(draft.on, draft.account));
    }
  };
  return (
    <FormPanel
      title="New movement"
      description="One movement of money on one account, like a row of the sheet. After Add the form stays open with the same day and account, to type the next one."
      submitLabel="Add movement"
      canSubmit={complete(draft)}
      onSubmit={add}
      onCancel={onClose}
      layout="stack"
    >
      <div className="form-grid">
        <Field label="Data" htmlFor="new-move-on">
          <input id="new-move-on" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={draft.on} onChange={(e) => change({ on: e.target.value })} />
        </Field>
        <Field label="Conto" htmlFor="new-move-account">
          <select id="new-move-account" className="input small" value={draft.account} onChange={(e) => change({ account: e.target.value as CashAccount })}>
            {ACCOUNTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        <Field label="Entrate o uscite" htmlFor="new-move-direction">
          <select id="new-move-direction" className="input small" value={draft.direction} onChange={(e) => change({ direction: e.target.value as "in" | "out", ...(e.target.value === "out" ? { sponsorship: false } : {}) })}>
            <option value="out">Uscite (money out)</option>
            <option value="in">Entrate (money in)</option>
          </select>
        </Field>
        <Field label="Importo (€)" htmlFor="new-move-amount">
          <input id="new-move-amount" className="input small" type="number" min="0" step="0.01" placeholder="0,00" value={draft.amount} onChange={(e) => change({ amount: e.target.value })} />
        </Field>
        <Field label="Descrizione" htmlFor="new-move-description" className="wide">
          <input id="new-move-description" className="input small" maxLength={500} autoFocus value={draft.description} onChange={(e) => change({ description: e.target.value })} />
        </Field>
        <Field label="Voce" htmlFor="new-move-voce">
          <SearchSelect id="new-move-voce" value={draft.categoryId} onChange={choose} choices={[{ value: "", label: "—" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]} />
        </Field>
        <Field label="Metodo di pagamento" htmlFor="new-move-method">
          <select id="new-move-method" className="input small" value={draft.methodId} onChange={(e) => change({ methodId: e.target.value })}>
            <option value="">—</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={draft.invoiceChecked} onChange={(e) => change({ invoiceChecked: e.target.checked })} />
        Check fattura
      </label>
      <label className="checkbox">
        <input type="checkbox" disabled={draft.direction === "out"} checked={draft.direction === "in" && draft.sponsorship} onChange={(e) => change({ sponsorship: e.target.checked })} />
        Sponsorship (money in only: it owes 11% VAT)
      </label>
      {last && <p className="muted" role="status">{last}</p>}
    </FormPanel>
  );
}

/** The row of the sheet with the balances at the start of the year: typed, or carried over from the year before. */
function OpeningRow({ register }: { register: CashRegister }) {
  const act = useAction();
  return (
    <tr className="opening">
      <td colSpan={6}>Saldo al 01/01/{register.year}</td>
      {ACCOUNTS.map((a) => (
        <Fragment key={a.value}>
          <td colSpan={2} className="group-start" />
          <td className="num sum">
            <CommitInput
              value={register.openingSet[a.value] ? decimalText(register.opening[a.value], 2) : ""}
              placeholder={decimalText(register.opening[a.value], 2)}
              label={`Saldo iniziale ${a.label}`}
              onCommit={(text) => act(() => api.setCashOpening({ year: register.year, account: a.value, amount: text === "" ? null : text.replace(",", ".") }))}
            />
          </td>
        </Fragment>
      ))}
      <td className="num sum">{money(register.total.opening)}</td>
      <td />
    </tr>
  );
}

export function CashRegisterPage() {
  const { canManageCash } = useMe().permissions;
  const act = useAction();
  const [year, setYear] = useState<number | undefined>();
  const register = useQuery({ queryKey: ["cash-register", year ?? "now"], queryFn: () => api.cashRegister(year), enabled: canManageCash });
  const categories = useQuery({ queryKey: ["cash-categories"], queryFn: api.cashCategories, enabled: canManageCash });
  const methods = useQuery({ queryKey: ["cash-methods"], queryFn: api.cashMethods, enabled: canManageCash });
  const [account, setAccount] = useState<CashAccount | "all">("all");
  const [month, setMonth] = useState("");
  const [voce, setVoce] = useState("");
  const [text, setText] = useState("");
  const [toCheck, setToCheck] = useState(false);
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [importing, setImporting] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);
  const linkedEntry = register.data?.entries.find((e) => e.id === linking);

  if (!canManageCash) return <Message>Only the treasury and the admins can see the register.</Message>;
  if (!register.data || !categories.data || !methods.data) return <Loading />;
  const data = register.data;
  const voci = categories.data;
  const nameOf = (list: CashListItem[], id: number | null) => list.find((i) => i.id === id)?.name ?? "";

  const shown = data.entries.filter(
    (e) =>
      (account === "all" || e.account === account) &&
      (month === "" || e.on.slice(5, 7) === month) &&
      (voce === "" || String(e.categoryId ?? "") === voce) &&
      (!toCheck || !e.invoiceChecked) &&
      (text === "" || e.description.toLowerCase().includes(text.toLowerCase())),
  );
  const change = (e: CashEntryRow) => setEditing({ id: e.id, draft: draftOf(e) });
  const save = async () => {
    if (editing && (await act(() => api.updateCashEntry(editing.id, bodyOf(editing.draft))))) setEditing(null);
  };
  const remove = (e: CashEntryRow) => {
    if (window.confirm(`Delete "${e.description || "this movement"}" of ${date(e.on)}?`)) void act(() => api.deleteCashEntry(e.id));
  };

  return (
    <>
      <PageHeader
        title="REGISTRO DI CASSA"
        description="The movements of the team's money (Cassa, Banca, Paypal), as in the sheet of the treasury. New movement adds one; the pencil of a row changes it. The balances are worked out from the movements and are those of the whole year, even when a filter hides rows. The funds of the sponsors are not here."
        add={{ label: "New movement", form: (close) => <NewMovement categories={voci} methods={methods.data} onClose={close} /> }}
        actions={
          <>
            <Field label="Year" htmlFor="register-year">
              <select id="register-year" className="input small" value={data.year} onChange={(e) => setYear(Number(e.target.value))}>
                {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Button variant="ghost" icon={faFileExcel} onClick={() => setImporting(!importing)}>{importing ? "Close import" : "Import from Excel"}</Button>
          </>
        }
      />
      {importing && <CashImport categories={voci} methods={methods.data} onClose={() => setImporting(false)} />}
      {linkedEntry && (
        <Panel title={`Lines paid by: ${linkedEntry.description || "this payment"} (${date(linkedEntry.on)})`}>
          <PayLines entry={linkedEntry} onClose={() => setLinking(null)} />
        </Panel>
      )}
      <Cards>
        <MoneyCard caption="Cassa" cents={data.closing.cash} />
        <MoneyCard caption="Banca" cents={data.closing.bank} />
        <MoneyCard caption="Paypal" cents={data.closing.paypal} />
        <MoneyCard caption="Totale (cassa + banca)" cents={data.total.closing} />
      </Cards>

      <div className="inline-form">
        <Chips label="Conto" value={account} onChange={setAccount} options={[{ value: "all", label: "All accounts" }, ...ACCOUNTS.map((a) => ({ value: a.value, label: a.label }))]} />
        <Field label="Month" htmlFor="register-month">
          <select id="register-month" className="input small" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
          </select>
        </Field>
        <Field label="Voce" htmlFor="register-voce">
          <select id="register-voce" className="input small" value={voce} onChange={(e) => setVoce(e.target.value)}>
            <option value="">All</option>
            {voci.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Search" htmlFor="register-search">
          <input id="register-search" className="input small" placeholder="Descrizione" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={toCheck} onChange={(e) => setToCheck(e.target.checked)} />
          Invoice not checked
        </label>
      </div>

      <TableBox title={`Registro di cassa ${data.year}`}>
        <table className="data-table register">
          <thead>
            <tr>
              <th colSpan={6} />
              {ACCOUNTS.map((a) => <th key={a.value} colSpan={3} className="group-start">{a.label}</th>)}
              <th>TOTALE</th>
              <th />
            </tr>
            <tr>
              <th>DATA</th>
              <th>DESCRIZIONE</th>
              <th>VOCE</th>
              <th>METODO DI PAGAMENTO</th>
              <th>CHECK FATTURA</th>
              <th>SPONSORSHIP</th>
              {ACCOUNTS.map((a) => (
                <Fragment key={a.value}>
                  <th className="num group-start">ENTRATE</th>
                  <th className="num">USCITE</th>
                  <th className="num sum">PROGRESSIVO</th>
                </Fragment>
              ))}
              <th className="num sum">PROGRESSIVO CUMULATO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <OpeningRow register={data} />
            {shown.map((e) =>
              editing?.id === e.id ? (
                <tr key={e.id} className="entry">
                  <EntryCells draft={editing.draft} onChange={(c) => setEditing({ id: e.id, draft: { ...editing.draft, ...c } })} onSave={save} onCancel={() => setEditing(null)} categories={voci} methods={methods.data} idPrefix={`entry-${e.id}`} />
                </tr>
              ) : (
                <tr key={e.id}>
                  <td>{date(e.on)}</td>
                  <td className="lines">
                    {e.description}
                    {e.inflow && <span className="muted"> · received the inflow {e.inflow.sourceName}</span>}
                    {e.lines.length > 0 && <span className="muted"> · paid {e.lines.map((l) => `${l.item} ${money(l.cents)}`).join(", ")}</span>}
                  </td>
                  <td className="lines">{nameOf(voci, e.categoryId)}</td>
                  <td>{nameOf(methods.data, e.methodId)}</td>
                  <td>{e.invoiceChecked ? "yes" : ""}</td>
                  <td>{e.sponsorship ? "yes" : ""}</td>
                  {ACCOUNTS.map((a) => (
                    <Fragment key={a.value}>
                      <td className="num group-start">{e.account === a.value && e.cents > 0 ? money(e.cents) : ""}</td>
                      <td className="num">{e.account === a.value && e.cents < 0 ? money(-e.cents) : ""}</td>
                      <td className={`num sum${e.account === a.value ? "" : " muted"}`}>{money(e.balances[a.value])}</td>
                    </Fragment>
                  ))}
                  <td className="num sum">{money(e.total)}</td>
                  <td className="num">
                    {e.cents < 0 && <IconButton icon={faLink} label="Lines of the budget paid" onClick={() => setLinking(linking === e.id ? null : e.id)} />}
                    <IconButton icon={faPen} label="Change movement" onClick={() => change(e)} />
                    <IconButton icon={faTrash} label="Delete movement" danger onClick={() => remove(e)} />
                  </td>
                </tr>
              ),
            )}
            {shown.length === 0 && (
              <tr><td colSpan={17} className="empty">{data.entries.length === 0 ? "No movements in this year yet" : "No movement matches the filters"}</td></tr>
            )}
          </tbody>
        </table>
      </TableBox>
    </>
  );
}
