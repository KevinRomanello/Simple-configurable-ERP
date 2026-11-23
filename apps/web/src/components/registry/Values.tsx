import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FieldOptions, FieldType } from "@erp/registry";
import { useState } from "react";
import { registry, type FileRef, type LinkedRef } from "../../api/registry";
import { formatDuration, isPicture, showValue } from "../../lib/registry";
import { PictureLink } from "../Picture";
import { SearchSelect } from "../SearchSelect";
import { Barcode, QrCode } from "./Codes";

// Showing and changing one value of the registry, by the type of its field: the same in the record and in
// the forms. Files are not here: the record uploads them at once, the form sends them with the answers.

interface Described {
  name: string;
  type: FieldType;
  options: FieldOptions;
}

const isRefs = (v: unknown): v is LinkedRef[] => Array.isArray(v) && v.every((x) => typeof x === "object" && x !== null && "id" in x);

/** A value to read: links as pills, files as links that open them, the rest as text. */
export function ValueView({ field, value }: { field: Described; value: unknown }) {
  if (field.type === "attachment" && Array.isArray(value)) {
    return (
      <span className="chips-inline">
        {(value as FileRef[]).map((f) =>
          isPicture(f) ? <PictureLink key={f.id} src={registry.fileUrl(f.id)} name={f.name} /> : <a key={f.id} href={registry.fileUrl(f.id)} target="_blank" rel="noreferrer">{f.name}</a>,
        )}
      </span>
    );
  }
  if ((field.type === "link" || field.type === "multiselect" || field.type === "user") && Array.isArray(value)) {
    return (
      <span className="chips-inline">
        {value.map((v, i) => <span key={i} className="pill teal">{showValue(field, v)}</span>)}
      </span>
    );
  }
  if (field.type === "url" && typeof value === "string" && value) return <a href={value} target="_blank" rel="noreferrer">{value}</a>;
  if (field.type === "qrcode" && typeof value === "string" && value) return <QrCode text={value} />;
  if (field.type === "barcode" && typeof value === "string" && value) return <Barcode text={value} format={field.options.barcodeFormat} />;
  if (field.type === "color" && typeof value === "string" && value) return <span className="color-value"><span className="swatch" style={{ background: value }} aria-hidden />{value}</span>;
  if (field.type === "geodata" && typeof value === "string" && value) {
    // the map is opened on OpenStreetMap: the page itself loads nothing from outside
    const [lat, lng] = value.split(";");
    return <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`} target="_blank" rel="noreferrer">{showValue(field, value)}</a>;
  }
  if (field.type === "button" && typeof value === "string" && /^https?:\/\//i.test(value)) return <a className="btn small ghost" href={value} target="_blank" rel="noreferrer">{field.options.label ?? field.name}</a>;
  if (field.type === "longtext" && typeof value === "string") return <span className="pre-wrap">{value}</span>;
  return <>{showValue(field, value)}</>;
}

/** The text a date and time box shows (the time of this computer) for a moment kept in UTC. */
const toLocalInput = (iso: unknown) => {
  if (typeof iso !== "string" || iso === "") return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * A box to change a value. `choices`: the records a link may point at. `value` is what the API gives (links as
 * {id, name}); what `onChange` gets is what the API takes (links as ids).
 */
export function ValueInput({ id, field, value, onChange, choices, disabled }: {
  id: string;
  field: Described;
  value: unknown;
  onChange: (value: unknown) => void;
  choices?: LinkedRef[];
  disabled?: boolean;
}) {
  const o = field.options;
  const text = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  switch (field.type) {
    case "longtext":
      return <textarea id={id} className="input" rows={4} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input id={id} className="input small" type="number" step={o.precision ? 10 ** -o.precision : 1} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
    case "rating":
      return (
        <select id={id} className="input small" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
          <option value="">—</option>
          {Array.from({ length: (o.max ?? 5) + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? "0" : "★".repeat(n)}</option>)}
        </select>
      );
    case "checkbox":
      return <input id={id} type="checkbox" className="checkbox-input" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
    case "date":
      return <input id={id} className="input small" type="date" value={text.slice(0, 10)} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
    case "datetime":
      return <input id={id} className="input small" type="datetime-local" value={toLocalInput(value)} disabled={disabled} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    case "time":
      return <input id={id} className="input small" type="time" step={1} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
    case "duration":
      return <DurationInput id={id} value={typeof value === "number" ? value : null} format={o.durationFormat} disabled={disabled} onChange={onChange} />;
    case "color":
      return (
        <span className="inline-form">
          <input id={id} type="color" value={text || "#000000"} disabled={disabled} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={field.name} />
          <input className="input small" value={text} disabled={disabled} placeholder="#RRGGBB" aria-label={`${field.name} as text`} onChange={(e) => onChange(e.target.value || null)} />
        </span>
      );
    case "geodata":
      return <input id={id} className="input small" value={text.replace(";", ", ")} disabled={disabled} placeholder="46.0664, 11.1257" onChange={(e) => onChange(e.target.value || null)} />;
    case "user":
      return <LinkInput id={id} multiple={o.multiple === true} value={isRefs(value) ? value : []} choices={choices ?? []} disabled={disabled} onChange={onChange} />;
    case "select":
      return (
        <select id={id} className="input small" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {(o.choices ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      );
    case "multiselect": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="checks" id={id}>
          {(o.choices ?? []).map((c) => (
            <label key={c.name} className="checkbox">
              <input type="checkbox" checked={list.includes(c.name)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [...list, c.name] : list.filter((x) => x !== c.name))} />
              {c.name}
            </label>
          ))}
        </div>
      );
    }
    case "link":
      return <LinkInput id={id} multiple={o.multiple !== false} value={isRefs(value) ? value : []} choices={choices ?? []} disabled={disabled} onChange={onChange} />;
    case "json":
      return <JsonInput id={id} value={value} disabled={disabled} onChange={onChange} />;
    default: {
      const kind = field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text";
      return <input id={id} className="input small" type={kind} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    }
  }
}

/** Links: the records chosen as pills, and a box with a search to add one. */
function LinkInput({ id, multiple, value, choices, disabled, onChange }: { id: string; multiple: boolean; value: LinkedRef[]; choices: LinkedRef[]; disabled?: boolean; onChange: (ids: number[]) => void }) {
  const ids = value.map((v) => v.id);
  const rest = choices.filter((c) => !ids.includes(c.id));
  return (
    <div className="link-input">
      {value.map((v) => (
        <span key={v.id} className="pill teal">
          {v.name}
          {!disabled && (
            <button type="button" className="pill-x" aria-label={`Remove ${v.name}`} onClick={() => onChange(ids.filter((x) => x !== v.id))}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (multiple || value.length === 0) && (
        <SearchSelect
          id={id}
          value=""
          label="Add a link"
          choices={[{ value: "", label: multiple ? "Add…" : "Choose…" }, ...rest.map((c) => ({ value: String(c.id), label: c.name }))]}
          onChange={(v) => v && onChange(multiple ? [...ids, Number(v)] : [Number(v)])}
        />
      )}
    </div>
  );
}

/** A duration typed as h:mm (or seconds): kept as seconds, shown in the format of its field. */
function DurationInput({ id, value, format, disabled, onChange }: { id: string; value: number | null; format?: string; disabled?: boolean; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value === null ? "" : formatDuration(value, format));
  return <input id={id} className="input small" value={text} disabled={disabled} placeholder={format ?? "h:mm"} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(text.trim() === "" ? null : text.trim())} />;
}

function JsonInput({ id, value, disabled, onChange }: { id: string; value: unknown; disabled?: boolean; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <textarea
      id={id}
      className={`input${bad ? " error" : ""}`}
      rows={4}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        try {
          onChange(text.trim() === "" ? null : JSON.parse(text));
          setBad(false);
        } catch {
          setBad(true);
        }
      }}
    />
  );
}
