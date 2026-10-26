import { faPlus } from "@fortawesome/free-solid-svg-icons";
import type { FormEvent, ReactNode } from "react";
import { Button } from "../Button";
import { Panel } from "./Panel";

/**
 * The box of a form that adds something: title, a line of explanation if needed, the fields and,
 * last, the same two buttons everywhere (the one that adds, and Cancel). `layout="inline"` puts
 * the fields and the buttons on one row; `"stack"` for a longer form (fields in rows or sections).
 */
export function FormPanel({ title, description, submitLabel, canSubmit = true, onSubmit, onCancel, layout = "inline", children }: {
  title: ReactNode;
  description?: ReactNode;
  submitLabel: string;
  canSubmit?: boolean;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
  layout?: "inline" | "stack";
  children: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) void onSubmit();
  };
  const buttons = (
    <>
      <Button small icon={faPlus} type="submit" disabled={!canSubmit}>{submitLabel}</Button>
      <Button small variant="ghost" onClick={onCancel}>Cancel</Button>
    </>
  );
  return (
    <Panel title={title}>
      {description && <p className="muted">{description}</p>}
      {layout === "inline" ? (
        <form className="inline-form" onSubmit={submit}>
          {children}
          {buttons}
        </form>
      ) : (
        <form className="stack tight" onSubmit={submit}>
          {children}
          <div className="inline-form">{buttons}</div>
        </form>
      )}
    </Panel>
  );
}
