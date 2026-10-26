import type { ReactNode } from "react";

/** A field of a form: its label above the box (`htmlFor` is the id of the box). Without a label the box names itself (aria-label). */
export function Field({ label, htmlFor, children }: { label?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      {label !== undefined && <label htmlFor={htmlFor}>{label}</label>}
      {children}
    </div>
  );
}
