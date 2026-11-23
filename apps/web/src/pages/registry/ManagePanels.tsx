import { faArrowDown, faArrowUp, faClone, faCopy, faPen, faPlus, faStar, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { AccessLevel, AccessRule, BarcodeFormat, ColorRule, DurationFormat, FieldOptions, FieldType, RollupFn } from "@erp/registry";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { registry, type RegField, type RegTable, type RegView, type Webhook, type WebhookOptions } from "../../api/registry";
import { Button, IconButton } from "../../components/Button";
import { Chips } from "../../components/Chips";
import { Field, FormPanel, Panel } from "../../components/ui";
import { useMe } from "../../lib/auth";
import { COMPUTED, FIELD_TYPE_LABELS, groupLevels, NEW_FIELD_TYPES } from "../../lib/registry";
import { sheetAsCsv } from "../../lib/registrySheet";
import { useAction } from "../../lib/useAction";
import { FormsTab } from "./FormBuilder";
import { FieldsChooser, FilterEditor } from "./ViewTools";

export type ManageTab = "fields" | "views" | "forms" | "access" | "webhooks" | "import" | "table";

const TABS: { value: ManageTab; label: string }[] = [
  { value: "fields", label: "Fields" },
  { value: "views", label: "Views" },
  { value: "forms", label: "Forms" },
  { value: "access", label: "Access" },
  { value: "webhooks", label: "Webhooks" },
  { value: "import", label: "Import" },
  { value: "table", label: "Table" },
];

/** What who manages a table can change of it (docs/anagrafiche.md, §3–§10). */
export function ManagePanels({ table, view, tab, onTab }: { table: RegTable; view: RegView | undefined; tab: ManageTab; onTab: (tab: ManageTab) => void }) {
  return (
    <div className="stack tight">
      <Chips label="Settings of the table" value={tab} onChange={onTab} options={TABS} />
      {tab === "fields" && <FieldsTab table={table} />}
      {tab === "views" && <ViewsTab table={table} view={view} />}
      {tab === "forms" && <FormsTab table={table} />}
      {tab === "access" && <AccessTab table={table} />}
      {tab === "webhooks" && <WebhooksTab table={table} />}
      {tab === "import" && <ImportTab table={table} />}
      {tab === "table" && <TableTab table={table} />}
    </div>
  );
}

// --- fields -------------------------------------------------------------------------------------

function FieldsTab({ table }: { table: RegTable }) {
  const act = useAction();
  const [editing, setEditing] = useState<RegField | "new" | null>(null);
  const move = (i: number, by: number) => {
    const ids = table.fields.map((f) => f.id);
    const [moved] = ids.splice(i, 1);
    ids.splice(i + by, 0, moved!);
    return act(() => registry.orderFields(table.id, ids));
  };
  return (
    <Panel title="Fields" actions={<Button small icon={faPlus} onClick={() => setEditing("new")}>Add a field</Button>}>
      {editing && <FieldForm table={table} field={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      <table className="data-table">
        <thead>
          <tr><th>NAME</th><th>TYPE</th><th>RULES</th><th /></tr>
        </thead>
        <tbody>
          {table.fields.map((f, i) => (
            <tr key={f.id}>
              <td>
                {f.id === table.primaryFieldId && <span className="pill teal" title="Names the records">name</span>} {f.name}
                {f.description && <div className="hint">{f.description}</div>}
              </td>
              <td>{FIELD_TYPE_LABELS[f.type]}{f.type === "formula" && <div className="hint mono">{f.options.expression}</div>}</td>
              <td>{[f.required && "required", f.unique && "unique"].filter(Boolean).join(", ")}</td>
              <td className="num nowrap">
                {i > 0 && <IconButton icon={faArrowUp} label="Move up" onClick={() => move(i, -1)} />}
                {i < table.fields.length - 1 && <IconButton icon={faArrowDown} label="Move down" onClick={() => move(i, 1)} />}
                {f.id !== table.primaryFieldId && !["attachment", "button", "json"].includes(f.type) && (
                  <IconButton icon={faStar} label="Make it the name of the records" onClick={() => act(() => registry.updateTable(table.id, { primaryFieldId: f.id }))} />
                )}
                <IconButton icon={faPen} label={`Change ${f.name}`} onClick={() => setEditing(f)} />
                {!["link", "uuid"].includes(f.type) && <IconButton icon={faClone} label={`Duplicate ${f.name}`} onClick={() => act(() => registry.duplicateField(f.id))} />}
                <IconButton icon={faTrash} label={`Delete ${f.name}`} danger onClick={() => window.confirm(`Delete ${f.name} and all its values?`) && act(() => registry.deleteField(f.id))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** Which records a link offers: all, or the ones of a view of the linked table. */
function LimitView({ tableId, value, onChange }: { tableId: number; value?: number; onChange: (id: number | undefined) => void }) {
  const linked = useQuery({ queryKey: ["registry-table", tableId], queryFn: () => registry.table(tableId) });
  return (
    <Field label="Offers the records of" htmlFor="field-limit">
      <select id="field-limit" className="input small" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">All the records</option>
        {(linked.data?.views ?? []).filter((v) => v.type !== "form").map((v) => <option key={v.id} value={v.id}>The view {v.name}</option>)}
      </select>
    </Field>
  );
}

const ROLLUPS: { value: RollupFn; label: string }[] = [
  { value: "count", label: "How many linked" }, { value: "countValues", label: "How many with a value" }, { value: "countDistinct", label: "How many different values" },
  { value: "sum", label: "Sum" }, { value: "sumDistinct", label: "Sum of the different values" }, { value: "avg", label: "Average" },
  { value: "avgDistinct", label: "Average of the different values" }, { value: "min", label: "Smallest (or first date)" }, { value: "max", label: "Largest (or last date)" },
  { value: "concat", label: "All, as text" },
];

/** The types a default value is for, and the words a default may be besides a value. */
const DEFAULT_TYPES: FieldType[] = ["text", "longtext", "email", "url", "phone", "number", "rating", "checkbox", "date", "datetime", "time", "duration", "select", "multiselect", "geodata", "color", "json", "user"];
const UNIQUE_TYPES: FieldType[] = ["text", "email", "url", "phone", "number", "date", "datetime", "time", "duration", "select", "color", "geodata"];
const DURATION_FORMATS: DurationFormat[] = ["h:mm", "h:mm:ss", "h:mm:ss.s", "h:mm:ss.ss", "h:mm:ss.sss"];
// the kinds of barcode of the engine (BARCODE_FORMATS): the site uses only the types of @erp/registry
const BARCODE_FORMATS: BarcodeFormat[] = ["CODE128", "EAN13", "EAN8", "EAN5", "EAN2", "UPC", "CODE39", "ITF14", "MSI", "pharmacode", "codabar"];

function FieldForm({ table, field, onDone }: { table: RegTable; field: RegField | null; onDone: () => void }) {
  const act = useAction();
  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState<FieldType>(field?.type ?? "text");
  const [o, setO] = useState<FieldOptions>(field?.options ?? {});
  const [required, setRequired] = useState(field?.required ?? false);
  const [unique, setUnique] = useState(field?.unique ?? false);
  const [description, setDescription] = useState(field?.description ?? "");
  const [inverseName, setInverseName] = useState("");
  const [inverseMultiple, setInverseMultiple] = useState(true);
  const [choices, setChoices] = useState((field?.options.choices ?? []).map((c) => c.name).join("\n"));
  const tables = useQuery({ queryKey: ["registry-tables"], queryFn: registry.tables });
  const link = table.fields.find((f) => f.id === o.linkFieldId);
  const target = useQuery({ queryKey: ["registry-table", link?.options.tableId], queryFn: () => registry.table(link!.options.tableId!), enabled: link?.options.tableId !== undefined });
  const hooks = useQuery({ queryKey: ["registry-webhooks", table.id], queryFn: () => registry.webhooks(table.id), enabled: type === "button" });
  const [button, setButton] = useState<"webhook" | "url">(field?.options.url ? "url" : "webhook");
  const set = (change: FieldOptions) => setO({ ...o, ...change });
  const num = (text: string) => (text === "" ? undefined : Number(text));

  const submit = async () => {
    const options: FieldOptions = { ...o };
    if (type === "select" || type === "multiselect") options.choices = choices.split("\n").map((c) => c.trim()).filter(Boolean).map((n) => ({ name: n }));
    delete options.inverseId;
    // a default typed as text: lists by commas; nothing means none
    const d = typeof options.default === "string" ? options.default.trim() : options.default;
    options.default = d === "" || d === undefined ? undefined : type === "multiselect" && typeof d === "string" ? d.split(",").map((x) => x.trim()).filter(Boolean) : d;
    if (button === "webhook") delete options.url;
    if (button === "url") delete options.webhookId;
    if (field) {
      if (await act(() => registry.updateField(field.id, { name, type, options, required, unique, description }))) onDone();
    } else if (await act(() => registry.createField(table.id, { name, type, options, required, unique, description, ...(type === "link" ? { inverseName: inverseName || undefined, inverseMultiple } : {}) }))) onDone();
  };
  const computed = COMPUTED.includes(type);
  return (
    <FormPanel title={field ? `Change ${field.name}` : "New field"} submitLabel={field ? "Save" : "Add field"} canSubmit={name.trim() !== ""} onSubmit={submit} onCancel={onDone} layout="stack">
      <div className="form-grid">
        <Field label="Name" htmlFor="field-name"><input id="field-name" className="input small" value={name} autoFocus onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type" htmlFor="field-type">
          <select id="field-type" className="input small" value={type} disabled={field !== null && (computed || type === "link" || type === "attachment")} onChange={(e) => setType(e.target.value as FieldType)}>
            {NEW_FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Help for who fills it in" htmlFor="field-description" className="wide"><input id="field-description" className="input small" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      {!computed && (
        <div className="checks">
          <label className="checkbox"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required</label>
          {UNIQUE_TYPES.includes(type) && <label className="checkbox"><input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} /> Unique (no two records with the same value)</label>}
        </div>
      )}
      {DEFAULT_TYPES.includes(type) && !unique && (
        <Field label="Value of a new record" htmlFor="field-default">
          <input
            id="field-default"
            className="input small"
            placeholder={type === "date" || type === "datetime" ? "today" : type === "user" ? "@me" : "none"}
            value={Array.isArray(o.default) ? o.default.join(", ") : o.default === undefined || o.default === null ? "" : String(o.default)}
            onChange={(e) => set({ default: e.target.value })}
          />
          <span className="hint">Used when a new record does not say it. A value, or today, now (date and time), @me (the person writing: a user, or their email).</span>
        </Field>
      )}
      <div className="form-grid">
        {(type === "text" || type === "longtext") && (
          <>
            <Field label="Clean up" htmlFor="field-transform">
              <select id="field-transform" className="input small" value={o.transform ?? "none"} onChange={(e) => set({ transform: e.target.value as FieldOptions["transform"] })}>
                <option value="none">As written</option><option value="title">Title Case (names)</option><option value="lower">lower case</option><option value="upper">UPPER CASE</option>
              </select>
            </Field>
            <Field label="At most (characters)" htmlFor="field-max"><input id="field-max" className="input small" type="number" value={o.maxLength ?? ""} onChange={(e) => set({ maxLength: num(e.target.value) })} /></Field>
          </>
        )}
        {type === "phone" && <Field label="Prefix when missing" htmlFor="field-prefix"><input id="field-prefix" className="input small" placeholder="+39" value={o.defaultPrefix ?? ""} onChange={(e) => set({ defaultPrefix: e.target.value || undefined })} /></Field>}
        {type === "number" && (
          <>
            <Field label="Decimals" htmlFor="field-precision"><input id="field-precision" className="input small" type="number" min={0} max={6} value={o.precision ?? 0} onChange={(e) => set({ precision: num(e.target.value) })} /></Field>
            <Field label="Shown as" htmlFor="field-format">
              <select id="field-format" className="input small" value={o.format ?? "plain"} onChange={(e) => set({ format: e.target.value as FieldOptions["format"] })}>
                <option value="plain">Number</option><option value="currency">Money</option><option value="percent">Percent</option>
              </select>
            </Field>
            <Field label="Minimum" htmlFor="field-min"><input id="field-min" className="input small" type="number" value={o.min ?? ""} onChange={(e) => set({ min: num(e.target.value) })} /></Field>
            <Field label="Maximum" htmlFor="field-maxn"><input id="field-maxn" className="input small" type="number" value={o.max ?? ""} onChange={(e) => set({ max: num(e.target.value) })} /></Field>
          </>
        )}
        {type === "duration" && (
          <Field label="Written as" htmlFor="field-duration">
            <select id="field-duration" className="input small" value={o.durationFormat ?? "h:mm"} onChange={(e) => set({ durationFormat: e.target.value as DurationFormat })}>
              {DURATION_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        )}
        {(type === "qrcode" || type === "barcode") && (
          <>
            <Field label="Shows the field" htmlFor="field-code-of">
              <select id="field-code-of" className="input small" value={o.fieldId ?? ""} onChange={(e) => set({ fieldId: num(e.target.value) })}>
                <option value="">Choose…</option>
                {table.fields.filter((f) => f.id !== field?.id && !["qrcode", "barcode", "attachment", "button"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            {type === "barcode" && (
              <Field label="Kind" htmlFor="field-code-kind">
                <select id="field-code-kind" className="input small" value={o.barcodeFormat ?? "CODE128"} onChange={(e) => set({ barcodeFormat: e.target.value as BarcodeFormat })}>
                  {BARCODE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
            )}
          </>
        )}
        {type === "user" && <label className="checkbox"><input type="checkbox" checked={o.multiple === true} onChange={(e) => set({ multiple: e.target.checked })} /> More than one person</label>}
        {type === "rating" && <Field label="Stars" htmlFor="field-stars"><input id="field-stars" className="input small" type="number" min={1} max={10} value={o.max ?? 5} onChange={(e) => set({ max: num(e.target.value) })} /></Field>}
        {(type === "select" || type === "multiselect") && (
          <Field label="Choices, one per line" htmlFor="field-choices" className="wide"><textarea id="field-choices" className="input" rows={5} value={choices} onChange={(e) => setChoices(e.target.value)} /></Field>
        )}
        {type === "link" && (
          <>
            <Field label="Linked table" htmlFor="field-target">
              <select id="field-target" className="input small" value={o.tableId ?? ""} disabled={field !== null} onChange={(e) => set({ tableId: Number(e.target.value) })}>
                <option value="">Choose…</option>
                {(tables.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <label className="checkbox"><input type="checkbox" checked={o.multiple !== false} onChange={(e) => set({ multiple: e.target.checked })} /> Many records</label>
            {o.tableId !== undefined && <LimitView tableId={o.tableId} value={o.limitViewId} onChange={(limitViewId) => set({ limitViewId })} />}
            {!field && (
              <>
                <Field label="Name of the other side" htmlFor="field-inverse"><input id="field-inverse" className="input small" placeholder={table.name} value={inverseName} onChange={(e) => setInverseName(e.target.value)} /></Field>
                <label className="checkbox"><input type="checkbox" checked={inverseMultiple} onChange={(e) => setInverseMultiple(e.target.checked)} /> Many on the other side</label>
              </>
            )}
          </>
        )}
        {(type === "lookup" || type === "rollup") && (
          <>
            <Field label="Through the link" htmlFor="field-through">
              <select id="field-through" className="input small" value={o.linkFieldId ?? ""} onChange={(e) => set({ linkFieldId: Number(e.target.value), fieldId: undefined })}>
                <option value="">Choose…</option>
                {table.fields.filter((f) => f.type === "link").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            {type === "rollup" && (
              <Field label="Summary" htmlFor="field-fn">
                <select id="field-fn" className="input small" value={o.fn ?? "count"} onChange={(e) => set({ fn: e.target.value as RollupFn })}>
                  {ROLLUPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
            )}
            {(type === "lookup" || (o.fn ?? "count") !== "count") && (
              <Field label="Field of the linked records" htmlFor="field-of">
                <select id="field-of" className="input small" value={o.fieldId ?? ""} onChange={(e) => set({ fieldId: Number(e.target.value) })}>
                  <option value="">Choose…</option>
                  {(target.data?.fields ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
            )}
          </>
        )}
        {type === "formula" && (
          <Field label="Formula" htmlFor="field-formula" className="wide">
            <textarea id="field-formula" className="input mono" rows={3} placeholder='CONCAT({Name}, " ", {Surname})' value={o.expression ?? ""} onChange={(e) => set({ expression: e.target.value })} />
            <span className="hint">Fields in braces; the functions of NocoDB: CONCAT, IF, SWITCH, ISBLANK, REGEX_MATCH, TEXTAFTER, ROUND, ROUNDUP, SUM, AVG, TODAY, DATEADD, DATETIME_DIFF, DATETIME_FORMAT, WORKDAY, ARRAYJOIN, JSON_EXTRACT, RECORD_ID… (docs/anagrafiche.md, §5)</span>
          </Field>
        )}
        {type === "attachment" && (
          <>
            <Field label="Accepted types" htmlFor="field-accept"><input id="field-accept" className="input small" placeholder="application/pdf, image/*" value={(o.accept ?? []).join(", ")} onChange={(e) => set({ accept: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></Field>
            <Field label="MB per file" htmlFor="field-mb"><input id="field-mb" className="input small" type="number" value={o.maxSizeMb ?? 10} onChange={(e) => set({ maxSizeMb: num(e.target.value) })} /></Field>
            <Field label="Files at most" htmlFor="field-files"><input id="field-files" className="input small" type="number" value={o.maxFiles ?? 20} onChange={(e) => set({ maxFiles: num(e.target.value) })} /></Field>
          </>
        )}
        {type === "button" && (
          <>
            <Field label="Label" htmlFor="field-label"><input id="field-label" className="input small" value={o.label ?? ""} onChange={(e) => set({ label: e.target.value })} /></Field>
            <Chips label="What it does" value={button} onChange={setButton} options={[{ value: "webhook", label: "Calls a webhook" }, { value: "url", label: "Opens an address" }]} />
            {button === "webhook" ? (
              <Field label="Calls the webhook" htmlFor="field-hook">
                <select id="field-hook" className="input small" value={o.webhookId ?? ""} onChange={(e) => set({ webhookId: num(e.target.value) })}>
                  <option value="">Choose…</option>
                  {(hooks.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Address (a formula)" htmlFor="field-url" className="wide">
                <input id="field-url" className="input small mono" placeholder={'"https://maps.google.com/?q=" & URLENCODE({City})'} value={o.url ?? ""} onChange={(e) => set({ url: e.target.value })} />
              </Field>
            )}
          </>
        )}
      </div>
    </FormPanel>
  );
}

// --- views --------------------------------------------------------------------------------------

type ViewKind = "grid" | "gallery" | "kanban" | "calendar" | "timeline" | "map";
const VIEW_KINDS: { value: ViewKind; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "gallery", label: "Gallery (cards with a picture)" },
  { value: "kanban", label: "Kanban (columns by a choice)" },
  { value: "calendar", label: "Calendar (by a date)" },
  { value: "timeline", label: "Timeline (from a date to another)" },
  { value: "map", label: "Map (by coordinates)" },
];
const DATE_TYPES = ["date", "datetime", "created", "modified", "formula", "lookup"];

function ViewsTab({ table, view }: { table: RegTable; view: RegView | undefined }) {
  const act = useAction();
  const [name, setName] = useState("");
  const [type, setType] = useState<ViewKind>("grid");
  const [by, setBy] = useState("");
  const [until, setUntil] = useState("");
  const dates = table.fields.filter((f) => DATE_TYPES.includes(f.type));
  const choices = table.fields.filter((f) => f.type === "select");
  const pictures = table.fields.filter((f) => f.type === "attachment");
  const add = async () => {
    const config =
      type === "kanban" ? { groupBy: Number(by) }
      : type === "gallery" && by ? { coverField: Number(by) }
      : type === "calendar" || type === "timeline" ? { dateField: Number(by), ...(type === "timeline" && until ? { endDateField: Number(until) } : {}) }
      : type === "map" ? { geoField: Number(by) }
      : {};
    if (await act(() => registry.createView(table.id, { name, type, config }))) setName("");
  };
  return (
    <>
      {view && <ViewSettings key={view.id} table={table} view={view} />}
      <FormPanel title="New view" submitLabel="Add view" canSubmit={name.trim() !== "" && (!["kanban", "calendar", "timeline", "map"].includes(type) || by !== "")} onSubmit={add} onCancel={() => setName("")}>
        <Field label="Name" htmlFor="new-view-name"><input id="new-view-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Kind" htmlFor="new-view-kind">
          <select id="new-view-kind" className="input small" value={type} onChange={(e) => { setType(e.target.value as typeof type); setBy(""); }}>
            {VIEW_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        {type === "kanban" && (
          <Field label="Columns by" htmlFor="new-view-by">
            <select id="new-view-by" className="input small" value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="">Choose a Choice field…</option>
              {choices.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {(type === "calendar" || type === "timeline") && (
          <Field label={type === "calendar" ? "Date" : "From"} htmlFor="new-view-date">
            <select id="new-view-date" className="input small" value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="">Choose a date field…</option>
              {dates.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {type === "timeline" && (
          <Field label="To (optional)" htmlFor="new-view-until">
            <select id="new-view-until" className="input small" value={until} onChange={(e) => setUntil(e.target.value)}>
              <option value="">One day</option>
              {dates.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {type === "map" && (
          <Field label="Coordinates" htmlFor="new-view-geo">
            <select id="new-view-geo" className="input small" value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="">Choose a field of coordinates…</option>
              {table.fields.filter((f) => f.type === "geodata").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {type === "gallery" && (
          <Field label="Picture" htmlFor="new-view-cover">
            <select id="new-view-cover" className="input small" value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="">None</option>
              {pictures.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
      </FormPanel>
    </>
  );
}

function ViewSettings({ table, view }: { table: RegTable; view: RegView }) {
  const act = useAction();
  const [name, setName] = useState(view.name);
  const [config, setConfig] = useState(() => {
    // the site never has the password: left out, the one the view has stays
    const { hasPassword: _has, sharedPassword: _hash, ...rest } = view.config;
    return rest as RegView["config"];
  });
  const [password, setPassword] = useState<string | null | undefined>(undefined);
  const [slug, setSlug] = useState(view.slug ?? "");
  const save = () => act(() => registry.updateView(view.id, { name, config: { ...config, ...(password !== undefined ? { sharedPassword: password } : {}) }, slug: config.shared ? slug || null : view.slug }));
  const publicUrl = view.slug && view.config.shared ? `${window.location.origin}/api/registry/public/views/${view.slug}` : null;
  const choiceFields = table.fields.filter((f) => f.type === "select" || f.type === "multiselect");
  const rules: ColorRule[] = config.colors ?? [];
  const setRule = (i: number, rule: ColorRule | null) => setConfig({ ...config, colors: rule === null ? rules.filter((_, k) => k !== i) : rules.map((r, k) => (k === i ? rule : r)) });
  const locked = view.config.locked === true;
  return (
    <Panel
      title={`The view ${view.name}`}
      actions={
        <>
          <IconButton icon={faClone} label="Duplicate the view" onClick={() => act(() => registry.duplicateView(view.id))} />
          <IconButton icon={faTrash} label="Delete the view" danger onClick={() => window.confirm(`Delete the view ${view.name}?`) && act(() => registry.deleteView(view.id))} />
        </>
      }
    >
      <div className="stack tight">
        <label className="checkbox">
          <input type="checkbox" checked={config.locked === true} onChange={(e) => setConfig({ ...config, locked: e.target.checked })} />
          Locked: nobody changes its filter, fields and columns until it is unlocked here
        </label>
        {locked && <p className="hint">The view is locked: to change it, untick "Locked" and save (in the same save it may change).</p>}
        <Field label="Name" htmlFor="view-name"><input id="view-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="What it is for" htmlFor="view-description"><input id="view-description" className="input small" value={config.description ?? ""} onChange={(e) => setConfig({ ...config, description: e.target.value || undefined })} /></Field>
          <Field label="Folder" htmlFor="view-folder"><input id="view-folder" className="input small" placeholder="none" value={config.folder ?? ""} onChange={(e) => setConfig({ ...config, folder: e.target.value || undefined })} /></Field>
        </div>
        {view.type === "map" && (
          <Field label="Coordinates" htmlFor="view-geo">
            <select id="view-geo" className="input small" value={config.geoField ?? ""} onChange={(e) => setConfig({ ...config, geoField: Number(e.target.value) })}>
              {table.fields.filter((f) => f.type === "geodata").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Which records"><FilterEditor idPrefix="view-filter" fields={table.fields} filter={config.filter} onChange={(filter) => setConfig({ ...config, filter })} /></Field>
        <Field label="Fields shown"><FieldsChooser fields={table.fields} hidden={config.hidden ?? []} onChange={(hidden) => setConfig({ ...config, hidden })} /></Field>
        {view.type === "kanban" && (
          <Field label="Columns by" htmlFor="view-by">
            <select id="view-by" className="input small" value={groupLevels(config.groupBy)[0] ?? ""} onChange={(e) => setConfig({ ...config, groupBy: Number(e.target.value) })}>
              {table.fields.filter((f) => f.type === "select").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {(view.type === "calendar" || view.type === "timeline") && (
          <Field label={view.type === "calendar" ? "Date" : "From"} htmlFor="view-date">
            <select id="view-date" className="input small" value={config.dateField ?? ""} onChange={(e) => setConfig({ ...config, dateField: Number(e.target.value) })}>
              {table.fields.filter((f) => DATE_TYPES.includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {view.type === "timeline" && (
          <Field label="To" htmlFor="view-until">
            <select id="view-until" className="input small" value={config.endDateField ?? ""} onChange={(e) => setConfig({ ...config, endDateField: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">One day</option>
              {table.fields.filter((f) => DATE_TYPES.includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {view.type === "timeline" && (
          <Field label="Arrows to the records that come after (a gantt)" htmlFor="view-deps">
            <select id="view-deps" className="input small" value={config.dependencyField ?? ""} onChange={(e) => setConfig({ ...config, dependencyField: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">None</option>
              {table.fields.filter((f) => f.type === "link" && f.options.tableId === table.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {view.type === "grid" && (
          <div className="form-grid">
            <Field label="Rows" htmlFor="view-height">
              <select id="view-height" className="input small" value={config.rowHeight ?? "short"} onChange={(e) => setConfig({ ...config, rowHeight: e.target.value as NonNullable<typeof config.rowHeight> })}>
                <option value="short">Short</option><option value="medium">Medium</option><option value="tall">Tall</option><option value="extra">Extra</option>
              </select>
            </Field>
            <Field label="Columns that stay still" htmlFor="view-frozen"><input id="view-frozen" className="input small" type="number" min={0} max={10} value={config.frozen ?? 0} onChange={(e) => setConfig({ ...config, frozen: Number(e.target.value) || undefined })} /></Field>
          </div>
        )}
        <Field label="Colour of the records" htmlFor="view-color-by">
          <select id="view-color-by" className="input small" value={config.colorBy ?? ""} onChange={(e) => setConfig({ ...config, colorBy: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">By rules only</option>
            {choiceFields.map((f) => <option key={f.id} value={f.id}>The colour of the choice in {f.name}</option>)}
          </select>
        </Field>
        {rules.map((rule, i) => (
          <div key={i} className="rule stack tight">
            <div className="inline-form">
              <input type="color" aria-label="Colour" value={rule.color} onChange={(e) => setRule(i, { ...rule, color: e.target.value.toUpperCase() })} />
              <span>for the records where</span>
              <IconButton icon={faTrash} label="Remove the colour" danger onClick={() => setRule(i, null)} />
            </div>
            <FilterEditor idPrefix={`view-color-${i}`} fields={table.fields} filter={rule.filter} onChange={(filter) => setRule(i, { ...rule, filter })} />
          </div>
        ))}
        <div><Button small variant="ghost" icon={faPlus} onClick={() => setConfig({ ...config, colors: [...rules, { color: "#E8F0FE", filter: { join: "and", items: [] } }] })}>Add a colour</Button></div>
        {view.type === "gallery" && (
          <Field label="Picture" htmlFor="view-cover">
            <select id="view-cover" className="input small" value={config.coverField ?? ""} onChange={(e) => setConfig({ ...config, coverField: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">None</option>
              {table.fields.filter((f) => f.type === "attachment").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {table.isPeople && (
          <label className="checkbox">
            <input type="checkbox" checked={config.group === true} onChange={(e) => setConfig({ ...config, group: e.target.checked })} />
            A group: the people in this view get the rules of this group, and may get a role of the ERP (Settings › Registry)
          </label>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={config.shared === true} onChange={(e) => setConfig({ ...config, shared: e.target.checked })} />
          Public: anybody with the address reads these records, with the fields shown only (the website)
        </label>
        {config.shared && (
          <>
            <Field label="Address" htmlFor="view-slug"><input id="view-slug" className="input small" placeholder="members" value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
            <label className="checkbox">
              <input type="checkbox" checked={config.sharedDownload === true} onChange={(e) => setConfig({ ...config, sharedDownload: e.target.checked })} />
              Who opens it may download the records (CSV)
            </label>
            <Field label={view.config.hasPassword && password === undefined ? "Password (it has one: type a new one to change it)" : "Password (optional)"} htmlFor="view-password">
              <span className="inline-form">
                <input id="view-password" className="input small" type="password" autoComplete="new-password" value={password ?? ""} onChange={(e) => setPassword(e.target.value)} />
                {view.config.hasPassword && <Button small variant="ghost" onClick={() => setPassword(null)}>No password</Button>}
              </span>
              <span className="hint">Sent in the header X-View-Password, never in the address.</span>
            </Field>
          </>
        )}
        {publicUrl && <span className="hint">Public address: <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a></span>}
        <div><Button small onClick={save}>Save the view</Button></div>
      </div>
    </Panel>
  );
}

// --- access -------------------------------------------------------------------------------------

const LEVELS: { value: AccessLevel; label: string }[] = [{ value: "read", label: "Read" }, { value: "edit", label: "Edit" }, { value: "manage", label: "Manage" }];

function AccessTab({ table }: { table: RegTable }) {
  const act = useAction();
  const settings = useQuery({ queryKey: ["registry-settings"], queryFn: registry.settings });
  const [rules, setRules] = useState<AccessRule[]>(table.access ?? []);
  const groups = settings.data?.groups ?? [];
  const peopleLinks = table.fields.filter((f) => f.type === "link" && f.options.tableId === settings.data?.peopleTableId);
  const update = (i: number, change: Partial<AccessRule>) => setRules(rules.map((r, k) => (k === i ? { ...r, ...change } : r)));
  const whoValue = (r: AccessRule) => (r.who.kind === "group" ? `group:${r.who.groupId}` : r.who.kind === "self" ? `self:${r.who.linkFieldId ?? ""}` : "everyone");
  const whoFrom = (v: string): AccessRule["who"] => {
    if (v.startsWith("group:")) return { kind: "group", groupId: Number(v.slice(6)) };
    if (v.startsWith("self:")) return v === "self:" ? { kind: "self" } : { kind: "self", linkFieldId: Number(v.slice(5)) };
    return { kind: "everyone" };
  };
  return (
    <Panel title="Who sees and changes this table" actions={<Button small icon={faPlus} onClick={() => setRules([...rules, { who: { kind: "everyone" }, level: "read" }])}>Add a rule</Button>}>
      <p className="muted">
        The admins of the ERP always manage everything. The rules add up: the highest level wins; a field is seen if one rule shows it. Without rules, only the admins see the table.
        {groups.length === 0 && " There are no groups yet: a group is a view of the people table marked as a group."}
      </p>
      {rules.map((r, i) => (
        <div key={i} className="rule stack tight">
          <div className="inline-form">
            <select className="input small" aria-label="Who" value={whoValue(r)} onChange={(e) => update(i, { who: whoFrom(e.target.value) })}>
              <option value="everyone">Everybody who signs in</option>
              {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>Group: {g.name}</option>)}
              {table.isPeople && <option value="self:">Each person, on their own record</option>}
              {peopleLinks.map((f) => <option key={f.id} value={`self:${f.id}`}>Each person, on the records where {f.name} is them</option>)}
            </select>
            <Chips label="Level" value={r.level} onChange={(level) => update(i, { level })} options={LEVELS} />
            <IconButton icon={faTrash} label="Remove the rule" danger onClick={() => setRules(rules.filter((_, k) => k !== i))} />
          </div>
          <Field label="Fields they see"><FieldsChooser fields={table.fields} hidden={r.hidden ?? []} onChange={(hidden) => update(i, { hidden })} /></Field>
          {r.level !== "read" && (
            <Field label="Fields they may change">
              <FieldsChooser fields={table.fields.filter((f) => !COMPUTED.includes(f.type) && !(r.hidden ?? []).includes(f.id))} hidden={r.readOnly ?? []} onChange={(readOnly) => update(i, { readOnly })} />
            </Field>
          )}
        </div>
      ))}
      <div><Button small onClick={() => act(() => registry.updateTable(table.id, { access: rules }))}>Save the rules</Button></div>
    </Panel>
  );
}

// --- webhooks -----------------------------------------------------------------------------------

const EVENTS = ["create", "update", "delete", "comment"];

/** "Name: value" lines as headers, and back. */
const headersText = (h?: Record<string, string>) => Object.entries(h ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n");
const headersFrom = (text: string) => Object.fromEntries(text.split("\n").map((line) => line.split(/:(.*)/s).map((x) => x.trim())).filter(([k, v]) => k && v !== undefined).map(([k, v]) => [k!, v!]));

function WebhooksTab({ table }: { table: RegTable }) {
  const act = useAction();
  const hooks = useQuery({ queryKey: ["registry-webhooks", table.id], queryFn: () => registry.webhooks(table.id) });
  const [editing, setEditing] = useState<Webhook | "new" | null>(null);
  const [logOf, setLogOf] = useState<number | null>(null);
  const log = useQuery({ queryKey: ["registry-webhook-log", logOf], queryFn: () => registry.webhookLog(logOf!), enabled: logOf !== null });
  return (
    <>
      <Panel title="Webhooks" actions={<Button small icon={faPlus} onClick={() => setEditing("new")}>Add a webhook</Button>}>
        <p className="muted">After a change is saved the server sends the record to the address (n8n), signed: header X-Registry-Signature = sha256=HMAC of the body with the secret.</p>
        <table className="data-table">
          <thead><tr><th>NAME</th><th>ADDRESS</th><th>EVENTS</th><th>SECRET</th><th /></tr></thead>
          <tbody>
            {(hooks.data ?? []).map((h) => (
              <tr key={h.id}>
                <td>{h.name}{!h.active && <span className="pill teal"> off</span>}</td>
                <td className="mono">{h.options.method ?? "POST"} {h.url}</td>
                <td>{h.events.join(", ")}{h.options.when === "becomes" ? " · when it starts matching" : ""}{h.options.fields?.length ? ` · ${h.options.fields.join(", ")}` : ""}</td>
                <td><IconButton icon={faCopy} label="Copy the secret" onClick={() => navigator.clipboard.writeText(h.secret)} /></td>
                <td className="num nowrap">
                  <Button small variant="ghost" onClick={() => act(() => registry.testWebhook(h.id)).then(() => setLogOf(h.id))}>Test</Button>
                  <Button small variant="ghost" onClick={() => setLogOf(logOf === h.id ? null : h.id)}>Log</Button>
                  <Button small variant="ghost" onClick={() => act(() => registry.updateWebhook(h.id, { active: !h.active }))}>{h.active ? "Turn off" : "Turn on"}</Button>
                  <IconButton icon={faPen} label={`Change ${h.name}`} onClick={() => setEditing(h)} />
                  <IconButton icon={faClone} label={`Duplicate ${h.name}`} onClick={() => act(() => registry.duplicateWebhook(h.id))} />
                  <IconButton icon={faTrash} label={`Delete ${h.name}`} danger onClick={() => act(() => registry.deleteWebhook(h.id))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logOf !== null && (
          <ol className="history-list">
            {(log.data ?? []).map((c) => <li key={c.id}>{c.at.slice(0, 19).replace("T", " ")} · {c.event} {c.recordId ? `#${c.recordId}` : ""} · {c.status ?? "no answer"} {c.error ?? ""}</li>)}
            {log.data?.length === 0 && <li className="muted">No calls yet.</li>}
          </ol>
        )}
      </Panel>
      {editing && <WebhookForm key={editing === "new" ? "new" : editing.id} table={table} hook={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
    </>
  );
}

/** A webhook as NocoDB makes them: address, method, headers, a body from a template, when it is called. */
function WebhookForm({ table, hook, onDone }: { table: RegTable; hook: Webhook | null; onDone: () => void }) {
  const act = useAction();
  const [name, setName] = useState(hook?.name ?? "");
  const [url, setUrl] = useState(hook?.url ?? "");
  const [events, setEvents] = useState<string[]>(hook?.events ?? ["create", "update"]);
  const [filter, setFilter] = useState(hook?.filter ?? undefined);
  const [method, setMethod] = useState<NonNullable<WebhookOptions["method"]>>(hook?.options.method ?? "POST");
  const [headers, setHeaders] = useState(headersText(hook?.options.headers));
  const [body, setBody] = useState(hook?.options.body ?? "");
  const [fields, setFields] = useState<string[]>(hook?.options.fields ?? []);
  const [when, setWhen] = useState<NonNullable<WebhookOptions["when"]>>(hook?.options.when ?? "matches");
  const submit = async () => {
    const values = { name, url, events, filter: filter && filter.items.length ? filter : null, method, headers: headersFrom(headers), body: body.trim() || null, fields, when };
    if (await act(() => (hook ? registry.updateWebhook(hook.id, values) : registry.createWebhook(table.id, values)))) onDone();
  };
  return (
    <FormPanel title={hook ? `Change ${hook.name}` : "New webhook"} submitLabel={hook ? "Save" : "Add webhook"} canSubmit={name.trim() !== "" && /^https?:\/\//.test(url) && events.length > 0} onSubmit={submit} onCancel={onDone} layout="stack">
      <div className="form-grid">
        <Field label="Name" htmlFor="hook-name"><input id="hook-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Method" htmlFor="hook-method">
          <select id="hook-method" className="input small" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {["POST", "PUT", "PATCH", "GET", "DELETE"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Address" htmlFor="hook-url" className="wide"><input id="hook-url" className="input small" placeholder="https://n8n…/webhook/…" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
      </div>
      <div className="checks">
        {EVENTS.map((ev) => (
          <label key={ev} className="checkbox"><input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} /> {ev}</label>
        ))}
      </div>
      <Field label="Only for the records where (optional)"><FilterEditor idPrefix="hook-filter" fields={table.fields} filter={filter} onChange={setFilter} /></Field>
      <Chips label="When" value={when} onChange={setWhen} options={[{ value: "matches", label: "Every change of a record that matches" }, { value: "becomes", label: "Only when a record starts matching" }]} />
      <Field label="An update counts only if one of these fields changed (none: any)">
        <FieldsChooser fields={table.fields} hidden={table.fields.filter((f) => !fields.includes(f.name)).map((f) => f.id)} onChange={(hidden) => setFields(table.fields.filter((f) => !hidden.includes(f.id)).map((f) => f.name))} />
      </Field>
      <Field label="Headers, one per line" htmlFor="hook-headers"><textarea id="hook-headers" className="input mono" rows={2} placeholder="Authorization: Bearer …" value={headers} onChange={(e) => setHeaders(e.target.value)} /></Field>
      <Field label="Body (optional: without it, the whole event as JSON)" htmlFor="hook-body">
        <textarea id="hook-body" className="input mono" rows={4} placeholder={'{"text": "{{record.fields.Name}} is now {{record.fields.State}}"}'} value={body} onChange={(e) => setBody(e.target.value)} />
        <span className="hint">{"{{path}} writes a value, {{json path}} writes it as JSON, {{#each list}}…{{/each}} and {{#if path}}…{{else}}…{{/if}}, like the templates of NocoDB."}</span>
      </Field>
    </FormPanel>
  );
}

// --- import -------------------------------------------------------------------------------------

function ImportTab({ table }: { table: RegTable }) {
  const act = useAction();
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<"create" | "upsert">("create");
  const [key, setKey] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof registry.importCsv>> | null>(null);
  const run = (dryRun: boolean) => act(async () => setResult(await registry.importCsv(table.id, { csv, mode, key: mode === "upsert" ? key : undefined, dryRun })));
  return (
    <Panel title="Import a CSV or an Excel file">
      <p className="muted">The first row names the fields (of an Excel file, the first sheet). Links by the name of the linked record (import the linked tables first). Checked first; nothing is saved unless every row is right.</p>
      <div className="stack tight">
        <input type="file" accept=".csv,text/csv,.xlsx" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(f.name.toLowerCase().endsWith(".xlsx") ? await sheetAsCsv(f) : await f.text()); setResult(null); }} />
        <Chips label="How" value={mode} onChange={setMode} options={[{ value: "create", label: "Add every row" }, { value: "upsert", label: "Change the matching records, add the others" }]} />
        {mode === "upsert" && (
          <Field label="Matching by" htmlFor="import-key">
            <select id="import-key" className="input small" value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Choose…</option>
              {table.fields.filter((f) => !COMPUTED.includes(f.type)).map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
          </Field>
        )}
        <div className="inline-form">
          <Button small variant="ghost" disabled={csv === ""} onClick={() => run(true)}>Check</Button>
          <Button small disabled={csv === "" || !result || result.errors.length > 0} onClick={() => run(false)}>Import</Button>
        </div>
        {result && (
          <div className={result.errors.length ? "hint error" : "hint"}>
            {result.saved ? "Imported: " : "It would "}{result.create} new, {result.update} changed, of {result.rows} rows.
            {result.ignoredColumns.length > 0 && ` Columns left out: ${result.ignoredColumns.join(", ")}.`}
            {result.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
          </div>
        )}
      </div>
    </Panel>
  );
}

// --- the table itself ---------------------------------------------------------------------------

function TableTab({ table }: { table: RegTable }) {
  const act = useAction();
  const isAdmin = useMe().role === "admin";
  const [name, setName] = useState(table.name);
  const [section, setSection] = useState(table.section);
  const [icon, setIcon] = useState(table.icon);
  const [description, setDescription] = useState(table.description);
  const [withRecords, setWithRecords] = useState(true);
  const duplicate = async () => {
    let id = 0;
    let skipped: string[] = [];
    if (await act(async () => ({ id, skippedFields: skipped } = await registry.duplicateTable(table.id, { records: withRecords })))) {
      if (skipped.length) window.alert(`The copy is made. Left out: ${skipped.join(", ")} (links, and what reads them, belong to a pair).`);
      window.location.assign(`/registry/${id}`);
    }
  };
  return (
    <Panel title="The table" actions={isAdmin && <IconButton icon={faTrash} label="Delete the table" danger onClick={() => window.confirm(`Delete ${table.name} with all its records? It cannot be undone.`) && act(() => registry.deleteTable(table.id)).then((done) => done && window.location.assign("/registry"))} />}>
      <div className="form-grid">
        <Field label="Name" htmlFor="table-name"><input id="table-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Section of the menu" htmlFor="table-section"><input id="table-section" className="input small" placeholder="HR & Recruitment" value={section} onChange={(e) => setSection(e.target.value)} /></Field>
        <Field label="Icon (an emoji)" htmlFor="table-icon"><input id="table-icon" className="input small" value={icon} onChange={(e) => setIcon(e.target.value)} /></Field>
        <Field label="What it is for" htmlFor="table-description" className="wide"><input id="table-description" className="input small" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <div><Button small onClick={() => act(() => registry.updateTable(table.id, { name, section, icon, description }))}>Save</Button></div>
      {isAdmin && (
        <div className="inline-form">
          <Button small variant="ghost" icon={faClone} onClick={duplicate}>Duplicate the table</Button>
          <label className="checkbox"><input type="checkbox" checked={withRecords} onChange={(e) => setWithRecords(e.target.checked)} /> with its records</label>
        </div>
      )}
    </Panel>
  );
}
