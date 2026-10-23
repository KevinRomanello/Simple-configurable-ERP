import type { CustomCellEditorProps } from "ag-grid-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/** One thing to choose: what is stored, and what the person reads. */
export interface Choice {
  value: string;
  label: string;
}

/** The choices whose text contains what was typed (any case), in their own order. */
function matching(choices: Choice[], query: string): Choice[] {
  const wanted = query.trim().toLowerCase();
  return wanted === "" ? choices : choices.filter((c) => c.label.toLowerCase().includes(wanted));
}

/** The list under the box: the arrows move, Enter and a click choose. */
function Options({ shown, active, value, onPick, onHover, listId }: {
  shown: Choice[];
  active: number;
  value: string;
  onPick: (choice: Choice) => void;
  onHover: (index: number) => void;
  listId: string;
}) {
  return (
    <ul id={listId} role="listbox" className="search-list">
      {shown.map((c, i) => (
        <li
          key={c.value}
          role="option"
          aria-selected={c.value === value}
          className={`${i === active ? "active " : ""}${c.value === value ? "selected" : ""}`}
          // mouse-down, not click: the box would lose focus (and close the list) before a click arrived
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c);
          }}
          onMouseEnter={() => onHover(i)}
        >
          {c.label || "—"}
        </li>
      ))}
      {shown.length === 0 && <li className="none">Nothing found</li>}
    </ul>
  );
}

/** Moves the highlighted option with the arrows; Enter chooses it. Returns true when the key was used. */
function useKeys(shown: Choice[], active: number, setActive: (n: number) => void, pick: (c: Choice) => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive(Math.min(active + 1, shown.length - 1));
    else if (e.key === "ArrowUp") setActive(Math.max(active - 1, 0));
    else if (e.key === "Enter" && shown[active]) pick(shown[active]);
    else return false;
    e.preventDefault();
    return true;
  };
}

/**
 * A box to choose one of a list, with a search: type to narrow the list down. For long lists; a
 * short one (a handful of items) stays a plain `<select>`.
 */
export function SearchSelect({ id, value, choices, onChange, disabled, label, className = "input small" }: {
  id?: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const shown = useMemo(() => matching(choices, query), [choices, query]);
  const current = choices.find((c) => c.value === value);

  const pick = (choice: Choice) => {
    onChange(choice.value);
    setOpen(false);
    setQuery("");
  };
  const onKey = useKeys(shown, active, setActive, pick);

  return (
    <div className="search-select">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        className={className}
        disabled={disabled}
        autoComplete="off"
        value={open ? query : (current?.label ?? "")}
        placeholder={open ? (current?.label ?? "Search…") : ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
          else onKey(e);
        }}
      />
      {open && <Options shown={shown} active={active} value={value} onPick={pick} onHover={setActive} listId={listId} />}
    </div>
  );
}

/**
 * The same search, as the editor of a cell of the budget grid (the free version of the grid has
 * only a plain list). `values` come from the column; an empty one means "nothing".
 */
export function SearchSelectEditor({ value, values, onValueChange, stopEditing }: CustomCellEditorProps & { values: string[] }) {
  const choices = useMemo(() => values.map((v) => ({ value: v, label: v })), [values]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => matching(choices, query), [choices, query]);
  useEffect(() => input.current?.focus(), []);

  const pick = (choice: Choice) => {
    onValueChange(choice.value);
    // the grid reads the value when the editor closes: let it take this one first
    setTimeout(() => stopEditing(), 0);
  };
  const onKey = useKeys(shown, active, setActive, pick);

  return (
    <div className="search-editor">
      <input
        ref={input}
        className="input small"
        placeholder={value ? String(value) : "Search…"}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      <Options shown={shown} active={active} value={String(value ?? "")} onPick={pick} onHover={setActive} listId={listId} />
    </div>
  );
}
