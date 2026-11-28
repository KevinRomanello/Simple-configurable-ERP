import { faPlus } from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";
import { DraftGuardContext, useAdder } from "../draftGuard";
import { Button } from "../Button";
import { DownloadMenu } from "../DownloadMenu";
import { Info } from "./Info";

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
 * The top of every page, one row: the title with its ⓘ (what the page is for, shown on a click) at the left; at the right what you can
 * do: the page's own commands, Download (it shows only when the page has tables or charts) and, last, the yellow button that adds
 * something (its form opens under the header). Under the row: the tabs of the page, when it has several views, and a notice that must
 * stay in sight (a read-only season, a warning), which is a state and not an explanation.
 */
export function PageHeader({ title, description, notice, tabs, add, actions }: {
  title: ReactNode;
  /** What the page is for: behind the ⓘ. */
  description?: ReactNode;
  /** A state the person must see without asking (read-only, nothing can be changed here): always in sight under the header. */
  notice?: ReactNode;
  /** The views of the page (`Tabs`). */
  tabs?: ReactNode;
  add?: AddAction;
  actions?: ReactNode;
}) {
  const { adding, toggle, hide, report } = useAdder(add?.draftKey);
  return (
    <>
      <div className="page-top">
        <header className="page-header">
          <div className="page-title">
            <h1>{title}</h1>
            {description && <Info label="About this page">{description}</Info>}
          </div>
          <div className="actions">
            {actions}
            <DownloadMenu />
            {add && <Button icon={faPlus} onClick={toggle}>{adding ? "Close" : add.label}</Button>}
          </div>
        </header>
        {tabs}
        {notice && <p className="page-notice">{notice}</p>}
      </div>
      {add && adding && <DraftGuardContext.Provider value={report}>{add.form(hide)}</DraftGuardContext.Provider>}
    </>
  );
}
