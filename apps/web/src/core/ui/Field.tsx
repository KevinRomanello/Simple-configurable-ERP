import type { ReactNode } from "react";

/** A field of a form: its label above the box (`htmlFor` is the id of the box). Without a label the box names itself (aria-label). */
export function Field({ label, htmlFor, className, children }: { label?: ReactNode; htmlFor?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className ? `field ${className}` : "field"}>
      {label !== undefined && <label htmlFor={htmlFor}>{label}</label>}
      {children}
    </div>
  );
}
