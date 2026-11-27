import { faPlus } from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";
import { DraftGuardContext, useAdder } from "../draftGuard";
import { Button } from "../Button";

/**
 * How something is added inside a box (a project, a list): the yellow button, and nothing else.
 * Pressing it opens the form with all its boxes right under it (the button then says "Close"),
 * like the yellow button of a page header does for the page.
 */
export function AddSection({ label, form, draftKey }: {
  /** "Add item", "New category"… */
  label: string;
  /** The form, as a `FormPanel`; `close` hides it again. */
  form: (close: () => void) => ReactNode;
  /** The key of the draft of the form (`useDraft`): with a draft the form starts open, and «Close» asks before losing what was written. */
  draftKey?: string;
}) {
  const { adding, toggle, hide, report } = useAdder(draftKey);
  return (
    <div className="add-section">
      <Button icon={faPlus} onClick={toggle}>{adding ? "Close" : label}</Button>
      {adding && <DraftGuardContext.Provider value={report}>{form(hide)}</DraftGuardContext.Provider>}
    </div>
  );
}
