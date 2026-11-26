import type { ReactNode, Ref } from "react";
import { useInAction } from "./inAction";

/**
 * A box of the page: everything about one thing (title, selectors, tables, charts) stays in one box.
 * `title` is the heading; with `actions` the heading gets a row with the commands on the right; `head`
 * replaces that row entirely (for a heading that is edited in place). Inside a popup (`Peek`) it draws no frame and no
 * title, which the popup has: only its commands and its contents.
 */
export function Panel({ title, actions, head, children, ref, className }: {
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
  head?: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  const inAction = useInAction();
  if (inAction) {
    return (
      <div className="stack tight">
        {head ? <div className="panel-head">{head}</div> : actions && <div className="panel-head"><span className="spacer" />{actions}</div>}
        {children}
      </div>
    );
  }
  return (
    <section ref={ref} className={className ? `panel ${className}` : "panel"}>
      {head ? (
        <div className="panel-head">{head}</div>
      ) : actions ? (
        <div className="panel-head">
          <h2>{title}</h2>
          <span className="spacer" />
          {actions}
        </div>
      ) : (
        title && <h2>{title}</h2>
      )}
      {children}
    </section>
  );
}
