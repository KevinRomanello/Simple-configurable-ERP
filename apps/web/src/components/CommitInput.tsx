import { useEffect, useState } from "react";

/** A text box in a table that saves when it loses focus (or on Enter), and only if the text changed. */
export function CommitInput({ value, label, list, wide, onCommit }: { value: string; label: string; list?: string; wide?: boolean; onCommit: (text: string) => void }) {
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
