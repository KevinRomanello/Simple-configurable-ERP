import type { ReactNode } from "react";
import { money } from "../../lib/format";

/** A row of figures with a caption each (the "cards" at the top of a page). */
export function Cards({ children }: { children: ReactNode }) {
  return <div className="cards">{children}</div>;
}

/** A figure with its caption; `hint` goes under it (a warning, for example). */
export function Card({ caption, children, negative = false, hint }: { caption: ReactNode; children: ReactNode; negative?: boolean; hint?: ReactNode }) {
  return (
    <div className="card">
      <span className="label-s sub">{caption}</span>
      <span className={`value${negative ? " negative" : ""}`}>{children}</span>
      {hint}
    </div>
  );
}

/** An amount as a card; negative amounts are flagged in red, as in the old sheet. */
export function MoneyCard({ caption, cents }: { caption: string; cents: number }) {
  return <Card caption={caption} negative={cents < 0}>{money(cents)}</Card>;
}
