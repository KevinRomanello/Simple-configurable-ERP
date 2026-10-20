import { money } from "../lib/format";

/** A figure with a caption; negative amounts are flagged in red, as in the old sheet. */
export function MoneyCard({ caption, cents }: { caption: string; cents: number }) {
  return (
    <div className="card">
      <span className="label-s sub">{caption}</span>
      <span className={`value${cents < 0 ? " negative" : ""}`}>{money(cents)}</span>
    </div>
  );
}
