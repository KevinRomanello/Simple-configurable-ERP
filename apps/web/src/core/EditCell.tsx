import { useRef, useState, type ReactNode } from "react";

/**
 * A cell of a table that reads as plain text and turns into its box on a click, like the cells of the
 * budget grid. Enter or leaving the box saves (only if it changed), Esc leaves it as it was. A `choice`
 * saves as soon as one is picked.
 */
export function EditCell({ kind, value, display, label, options, onCommit }: {
  kind: "text" | "date" | "amount" | "choice";
  /** What the box holds: the text, the day (YYYY-MM-DD), the amount as typed, or the value of the choice. */
  value: string;
  /** What is read while the cell is not being changed; by default the value, or a dash when empty. */
  display?: ReactNode;
  label: string;
  /** The choices of a `choice` cell. */
  options?: { value: string; label: string }[];
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  const finish = (next: string) => {
    setEditing(false);
    if (!cancelled.current && next.trim() !== value) onCommit(next.trim());
    cancelled.current = false;
  };
  const keys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      cancelled.current = true;
      event.currentTarget.blur();
    }
  };

  if (!editing) {
    return (
      <button type="button" className="edit-cell" title="Click to change" aria-label={`Change ${label}`} onClick={() => setEditing(true)}>
        {display ?? (value === "" ? <span className="faint">—</span> : value)}
      </button>
    );
  }
  if (kind === "choice") {
    return (
      <select autoFocus className="input small" aria-label={label} value={value} onChange={(e) => finish(e.target.value)} onBlur={(e) => finish(e.target.value)} onKeyDown={keys}>
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      autoFocus
      className="input small"
      type={kind === "date" ? "date" : kind === "amount" ? "number" : "text"}
      min={kind === "amount" ? "0" : kind === "date" ? "2000-01-01" : undefined}
      max={kind === "date" ? "2100-12-31" : undefined}
      step={kind === "amount" ? "0.01" : undefined}
      maxLength={kind === "text" ? 500 : undefined}
      defaultValue={value}
      aria-label={label}
      onFocus={(e) => kind !== "date" && e.currentTarget.select()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={keys}
    />
  );
}
