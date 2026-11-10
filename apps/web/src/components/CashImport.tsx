import { useState } from "react";
import { api } from "../api/client";
import type { ApplyBody, CashAccount, CashListItem, ImportBody, ImportPreview, ImportResult } from "../api/types";
import { readRegisterFile, type SheetRead } from "../lib/cashSheet";
import { date, money } from "../lib/format";
import { useAction } from "../lib/useAction";
import { Button } from "./Button";
import { Card, Cards, Field, Panel } from "./ui";

// "Import from Excel": the sheet of the treasury is read in the browser, checked against the register
// (nothing is saved), then added to it or put in its place. docs/registro-di-cassa.md, "L'import"

const ACCOUNT_NAME: Record<CashAccount, string> = { cash: "Cassa", bank: "Banca", paypal: "Paypal" };
const FIELD_NAME: Record<string, string> = { description: "the text", category: "the Voce", method: "the method", invoiceChecked: "the invoice box" };

/** "1 movement", "2 movements". */
const many = (n: number, one: string, other = `${one}s`) => `${n} ${n === 1 ? one : other}`;

type Outside = ImportBody["outside"];

const bodyOf = (read: SheetRead, year: number | undefined, outside: Outside): ImportBody => ({
  sheetName: read.sheetName,
  opening: read.opening,
  rows: read.rows,
  year,
  outside,
});

/** A Voce or a method the site does not have: created, or mapped to one it has. */
function Unknown({ title, items, known, map, onChange }: {
  title: string;
  items: { name: string; rows: number }[];
  known: CashListItem[];
  map: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="stack tight">
      <p><strong>{title}</strong>: the site does not have {items.length === 1 ? "this one" : "these"}. {items.length === 1 ? "It is" : "They are"} created, or used as another one:</p>
      {items.map((item) => (
        <Field key={item.name} label={`${item.name} (${many(item.rows, "movement")})`}>
          <select className="input small" value={map[item.name] ?? ""} onChange={(e) => onChange(item.name, e.target.value)}>
            <option value="">Create it</option>
            {known.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </Field>
      ))}
    </div>
  );
}

export function CashImport({ categories, methods, onClose }: { categories: CashListItem[]; methods: CashListItem[]; onClose: () => void }) {
  const act = useAction();
  const [file, setFile] = useState("");
  const [read, setRead] = useState<SheetRead | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [year, setYear] = useState<number | undefined>();
  const [outside, setOutside] = useState<Outside>("skip");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [updateChanged, setUpdateChanged] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [methodMap, setMethodMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const check = async (sheet: SheetRead, chosenYear: number | undefined, treatOutside: Outside) => {
    setBusy(true);
    setError("");
    try {
      const found = await api.previewCashImport(bodyOf(sheet, chosenYear, treatOutside));
      setPreview(found);
      setYear(found.year);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The check failed");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setResult(null);
    setFile(picked.name);
    try {
      const sheet = await readRegisterFile(picked);
      setRead(sheet);
      setOutside("skip");
      await check(sheet, undefined, "skip");
    } catch (problem) {
      setRead(null);
      setError(problem instanceof Error ? problem.message : "The file could not be read");
      setBusy(false);
    }
  };

  const ids = (map: Record<string, string>): Record<string, number | null> =>
    Object.fromEntries(Object.entries(map).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
  const apply = async () => {
    if (!read || !preview) return;
    const body: ApplyBody = { ...bodyOf(read, preview.year, outside), mode, confirmYear: mode === "replace" ? Number(confirm) : undefined, updateChanged, categoryMap: ids(categoryMap), methodMap: ids(methodMap) };
    if (await act(async () => setResult(await api.applyCashImport(body)))) {
      setPreview(null);
      setRead(null);
    }
  };

  const siteRows = preview ? preview.same + preview.changedCount + preview.onlySite : 0;
  const canApply = preview !== null && !busy && (mode === "add" ? preview.addedCount > 0 || (updateChanged && preview.changedCount > 0) : confirm === String(preview.year));

  return (
    <Panel title="Import from Excel" actions={<Button small variant="ghost" onClick={onClose}>Close</Button>}>
      <p className="muted">
        Choose the sheet of the treasury (the .xlsx, with the sheet «movimenti cassa e banca»). It is read here, in the browser, and checked against the register:
        nothing is saved until you apply it.
      </p>
      <Field label="File" htmlFor="import-file">
        <input id="import-file" type="file" accept=".xlsx" onChange={(e) => void choose(e.target.files?.[0])} />
      </Field>
      {busy && <p className="muted">Working…</p>}
      {error && <p className="error">{error}</p>}
      {result && (
        <p className="success">
          {result.mode === "replace" ? `The register of ${result.year} was replaced: ${result.deleted} movements deleted, ${result.added} loaded.` : `${many(result.added, "movement")} added${result.updated > 0 ? `, ${result.updated} changed` : ""}.`}
          {result.openings > 0 && ` Opening balances set: ${result.openings}.`}
        </p>
      )}

      {read && preview && (
        <div className="stack">
          <p>
            <strong>{file}</strong>: sheet «{read.sheetName}», {preview.rows.total} movements
            {read.opening ? `, opening balances found (${read.opening.label ?? "saldo"})` : ", no opening balances found"}.
          </p>
          {preview.years.length > 1 && (
            <Field label="Year of the sheet" htmlFor="import-year">
              <select id="import-year" className="input small" value={preview.year} onChange={(e) => void check(read, Number(e.target.value), outside)}>
                {preview.years.map((y) => <option key={y.year} value={y.year}>{y.year} ({y.rows} movements)</option>)}
              </select>
            </Field>
          )}
          <Cards>
            <Card caption={`In the sheet (${preview.year})`}>{preview.rows.used - (outside === "own" ? preview.rows.outsideYear : 0)}</Card>
            <Card caption="Already in the register">{preview.same}</Card>
            <Card caption="New">{preview.addedCount}</Card>
            <Card caption="Same movement, written differently">{preview.changedCount}</Card>
            <Card caption="Only in the register">{preview.onlySite}</Card>
          </Cards>

          <div className="stack tight">
            {read.problems.length > 0 && (
              <details open>
                <summary><strong>{many(read.problems.length, "row cannot be a movement", "rows cannot be movements")}</strong> and {read.problems.length === 1 ? "is" : "are"} left out</summary>
                <ul>{read.problems.slice(0, 30).map((p) => <li key={p.row}>Row {p.row}: {p.message}</li>)}</ul>
              </details>
            )}
            {preview.rows.outsideYear > 0 && (
              <div>
                <p>
                  <strong>{many(preview.rows.outsideYear, "movement is", "movements are")} dated in another year</strong> ({preview.years.filter((y) => y.year !== preview.year).map((y) => y.year).join(", ")}): probably a typo.
                </p>
                <ul>{preview.outside.slice(0, 8).map((o) => <li key={o.row}>Row {o.row}: {date(o.on)}, {o.description || "no text"}, {ACCOUNT_NAME[o.account]} {money(o.cents)}</li>)}</ul>
                <p>
                  The sheet counts {preview.rows.outsideYear === 1 ? "it" : "them"} in its balances ({(Object.keys(ACCOUNT_NAME) as CashAccount[]).filter((a) => preview.outsideEffect[a] !== 0).map((a) => `${ACCOUNT_NAME[a]} ${money(preview.outsideEffect[a])}`).join(", ")}):
                  left out, the balances of the site part from the sheet's by that.
                </p>
                {(
                  [
                    ["skip", "Leave them out"],
                    ["year", `Count them in ${preview.year} (the same day and month): a typo of the year`],
                    ["own", "Load them in their own year"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="checkbox">
                    <input type="radio" name="import-outside" checked={outside === value} onChange={() => { setOutside(value); void check(read, preview.year, value); }} />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {preview.noCategory > 0 && <p><strong>{many(preview.noCategory, "movement has", "movements have")} no Voce</strong>: {preview.noCategory === 1 ? "it is" : "they are"} loaded without one.</p>}
            <Unknown title="Voci" items={preview.unknownCategories} known={categories} map={categoryMap} onChange={(n, v) => setCategoryMap({ ...categoryMap, [n]: v })} />
            <Unknown title="Payment methods" items={preview.unknownMethods} known={methods} map={methodMap} onChange={(n, v) => setMethodMap({ ...methodMap, [n]: v })} />
            {read.mismatches.map((m) => (
              <p key={m.account}>
                <strong>The balance saved in the sheet for {ACCOUNT_NAME[m.account]} stops matching its movements at row {m.row}</strong> (it says {money(m.sheetCents)}, the movements give{" "}
                {money(m.computedCents)}). The site works the balances out from the movements.
              </p>
            ))}
            {preview.sponsorshipAdded > 0 && <p>{many(preview.sponsorshipAdded, "new movement is", "new movements are")} money in on a Voce of sponsorship: {preview.sponsorshipAdded === 1 ? "it starts" : "they start"} with the Sponsorship box ticked (11% VAT).</p>}
            {read.emptyRows > 0 && <p className="muted">{many(read.emptyRows, "empty row")} at the end of the sheet {read.emptyRows === 1 ? "is" : "are"} ignored.</p>}
            {read.notes.length > 0 && (
              <details>
                <summary>{many(read.notes.length, "note")} written beside the table (not imported)</summary>
                <ul>{read.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              </details>
            )}
          </div>

          <table className="data-table">
            <thead><tr><th>BALANCES</th>{(Object.keys(ACCOUNT_NAME) as CashAccount[]).map((a) => <th key={a} className="num">{ACCOUNT_NAME[a].toUpperCase()}</th>)}</tr></thead>
            <tbody>
              <tr><td>The sheet gives (end of {preview.year})</td>{(Object.keys(ACCOUNT_NAME) as CashAccount[]).map((a) => <td key={a} className="num">{money(preview.balances.sheet[a])}</td>)}</tr>
              <tr><td>The register has now</td>{(Object.keys(ACCOUNT_NAME) as CashAccount[]).map((a) => <td key={a} className="num">{money(preview.balances.site[a])}</td>)}</tr>
            </tbody>
          </table>

          <div className="stack tight">
            <label className="checkbox">
              <input type="radio" name="import-mode" checked={mode === "add"} onChange={() => setMode("add")} />
              <strong>Add what is missing</strong>
            </label>
            <p className="muted">
              The {preview.addedCount} new movements are added; nothing is ever deleted, and running it again adds nothing.
              A movement is already there if the day, the account, the amount and the text are the same.
            </p>
            {mode === "add" && preview.changedCount > 0 && (
              <>
                <ul>{preview.changed.slice(0, 8).map((c) => <li key={c.row}>Row {c.row}: {c.siteDescription || "no text"} → {c.description || "no text"} ({c.fields.map((f) => FIELD_NAME[f] ?? f).join(", ")})</li>)}</ul>
                <label className="checkbox">
                  <input type="checkbox" checked={updateChanged} onChange={(e) => setUpdateChanged(e.target.checked)} />
                  Also change the {preview.changedCount} movements that are written differently in the sheet
                </label>
              </>
            )}
            <label className="checkbox">
              <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
              <strong>Replace the {preview.year} register with the sheet</strong>
            </label>
            <p className="muted">
              The {siteRows} movements of {preview.year} are deleted and the sheet is loaded as it is, with its opening balances: the right choice while the sheet is the master copy.
              Other years are not touched, the deleted movements stay in the History, and the Sponsorship boxes start again from the Voce.
              Download the register first (the Download button of the page) if you want a copy.
            </p>
            {mode === "replace" && (
              <Field label={`Type ${preview.year} to confirm`} htmlFor="import-confirm">
                <input id="import-confirm" className="input small" inputMode="numeric" value={confirm} onChange={(e) => setConfirm(e.target.value.trim())} />
              </Field>
            )}
          </div>

          <div className="actions">
            <Button small disabled={!canApply} onClick={() => void apply()}>
              {mode === "add" ? `Add ${many(preview.addedCount, "movement")}${updateChanged && preview.changedCount > 0 ? ` and change ${preview.changedCount}` : ""}` : `Replace the ${preview.year} register`}
            </Button>
            <Button small variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
