import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { useState, type ReactNode } from "react";
import { Button } from "../Button";

/**
 * How something is added inside a box (a project, a list): the yellow button, and nothing else.
 * Pressing it opens the form with all its boxes right under it (the button then says "Close"),
 * like the yellow button of a page header does for the page.
 */
export function AddSection({ label, form }: {
  /** "Add item", "New category"… */
  label: string;
  /** The form, as a `FormPanel`; `close` hides it again. */
  form: (close: () => void) => ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="add-section">
      <Button icon={faPlus} onClick={() => setAdding(!adding)}>{adding ? "Close" : label}</Button>
      {adding && form(() => setAdding(false))}
    </div>
  );
}
