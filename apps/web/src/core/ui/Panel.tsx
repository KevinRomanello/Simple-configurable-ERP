import type { ReactNode, Ref } from "react";
import { useInAction } from "./inAction";
import { Info } from "./Info";

/**
 * A section of the page: everything about one thing (title, selectors, tables, charts) stays in one section.
 * `title` is the heading and `help` what the section is for, behind an ⓘ beside it (shown on a click); with `actions` the heading gets
 * a row with the commands on the right; `head` replaces that row entirely (for a heading that is edited in place). Inside the panel of
 * an action (`RowAction`) it draws no frame and no title, which the panel has: only its ⓘ, its commands and its contents.
 */
export function Panel({ title, help, actions, head, children, ref, className }: {
  className?: string;
  title?: ReactNode;
  help?: ReactNode;
  actions?: ReactNode;
  head?: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  const inAction = useInAction();
  const info = help && <Info label={typeof title === "string" ? `About ${title}` : "About this section"}>{help}</Info>;
  if (inAction) {
    return (
      <div className="stack tight">
        {head ? (
          <div className="panel-head">{head}</div>
        ) : (
          (actions || info) && (
            <div className="panel-head">
              {info}
              <span className="spacer" />
              {actions}
            </div>
          )
        )}
        {children}
      </div>
    );
  }
  const heading = (title || info) && (
    <div className="panel-title">
      {title && <h2>{title}</h2>}
      {info}
    </div>
  );
  return (
    <section ref={ref} className={className ? `panel ${className}` : "panel"}>
      {head ? (
        <div className="panel-head">{head}</div>
      ) : actions ? (
        <div className="panel-head">
          {heading}
          <span className="spacer" />
          {actions}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}
