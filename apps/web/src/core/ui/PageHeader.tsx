import { faPlus } from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";
import { DraftGuardContext, useAdder } from "../draftGuard";
import { Button } from "../Button";
import { DownloadMenu } from "../DownloadMenu";

/** Something the page lets you add: the yellow button of the header and the form it opens. */
export interface AddAction {
  /** "New sponsor", "Add goods"… (the button says "Close" while the form is open). */
  label: string;
  /** The form, shown in its own box under the header; `close` hides it again. */
  form: (close: () => void) => ReactNode;
  /** The key of the draft of the form (`useDraft`): with a draft the form starts open, and «Close» asks before losing what was written. */
  draftKey?: string;
}

/**
 * The top of every page: the title, a line on what the page is for and, under them, what you can
 * do: the yellow button to add something (it opens its form under the header), the page's own
 * commands and Download, always last (it shows only when the page has tables or charts).
 */
export function PageHeader({ title, description, add, actions }: {
  title: ReactNode;
  description?: ReactNode;
  add?: AddAction;
  actions?: ReactNode;
}) {
  const { adding, toggle, hide, report } = useAdder(add?.draftKey);
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        <div className="actions">
          {add && <Button icon={faPlus} onClick={toggle}>{adding ? "Close" : add.label}</Button>}
          {actions}
          <DownloadMenu />
        </div>
      </header>
      {add && adding && <DraftGuardContext.Provider value={report}>{add.form(hide)}</DraftGuardContext.Provider>}
    </>
  );
}
