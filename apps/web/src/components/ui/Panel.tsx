import type { ReactNode, Ref } from "react";

/**
 * A box of the page: everything about one thing (title, selectors, tables, charts) stays in one box.
 * `title` is the heading; with `actions` the heading gets a row with the commands on the right; `head`
 * replaces that row entirely (for a heading that is edited in place).
 */
export function Panel({ title, actions, head, children, ref }: {
  title?: ReactNode;
  actions?: ReactNode;
  head?: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <section ref={ref} className="panel">
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
