import type { ReactNode } from "react";
import type { Phase } from "../../core/calcTypes";
import { Panel } from "../../core/ui";

const PHASES: { phase: Phase; title: string }[] = [
  { phase: "estimate", title: "EXPECTED" },
  { phase: "actual", title: "ACTUAL" },
];

/**
 * One subject of a page with EXPECTED at the left and ACTUAL at the right, as the sheet has them, the two halves starting at the same
 * height: a page is a few of these one under the other (the inflows, then by month, then the chart), so comparing the two phases is
 * reading across a row, not scrolling two long columns. On a phone the halves go one under the other.
 */
export function PhasePair({ title, help, children }: { title: string; help?: ReactNode; children: (phase: Phase) => ReactNode }) {
  return (
    <Panel title={title} help={help}>
      <div className="two-columns">
        {PHASES.map(({ phase, title: name }) => (
          <div key={phase} className="stack tight">
            <h3 className="phase-label">{name}</h3>
            {children(phase)}
          </div>
        ))}
      </div>
    </Panel>
  );
}
