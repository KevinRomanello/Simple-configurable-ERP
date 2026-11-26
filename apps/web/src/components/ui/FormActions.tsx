import type { ReactNode } from "react";

/**
 * The buttons that end a form (the one that saves, Cancel). Alone in a page they are a row of buttons; inside the panel of an
 * action (`RowAction`) the row sticks to the bottom of the panel, so that the buttons are always in sight whatever the form's length.
 */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="inline-form form-actions">{children}</div>;
}
