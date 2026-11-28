import type { ReactNode } from "react";
import { NavLink } from "react-router";

/** A view of a page: a link when it has an address of its own (`to`), a button when it is only a state of the page. */
export interface Tab<T extends string = string> {
  key: T;
  label: ReactNode;
  to?: string;
  /** How many things the view holds, beside its name (the lists of TO PAY). */
  count?: number;
}

/**
 * The views of one page, under its header: where you are, not what you filter (that is `Chips`). The chosen tab is underlined.
 * Tabs with `to` are links (GANTT, ANALYSES, TOTAL, Settings: each view has its address); the others are buttons and `value` and
 * `onChange` say which one is chosen.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange }: {
  label: string;
  tabs: Tab<T>[];
  value?: T;
  onChange?: (value: T) => void;
}) {
  const body = (tab: Tab<T>) => (
    <>
      {tab.label}
      {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
    </>
  );
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((tab) =>
        tab.to ? (
          <NavLink key={tab.key} to={tab.to} className={({ isActive }) => `tab${isActive ? " on" : ""}`}>
            {body(tab)}
          </NavLink>
        ) : (
          <button key={tab.key} type="button" className={`tab${tab.key === value ? " on" : ""}`} aria-pressed={tab.key === value} onClick={() => onChange?.(tab.key)}>
            {body(tab)}
          </button>
        ),
      )}
    </nav>
  );
}
