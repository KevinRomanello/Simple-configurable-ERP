import { timeOf } from "../lib/drafts";
import type { DraftControls } from "../lib/useDraft";

/**
 * The line at the top of a form that came back with what was written: since when, and how to throw it away; and, when the thing was
 * changed by someone else after the writing began, the warning to look before saving.
 */
export function DraftNote({ draft, name }: { draft: Pick<DraftControls, "keptAt" | "stale" | "discard">; name?: string }) {
  if (draft.keptAt === null) return null;
  if (draft.stale) {
    return (
      <p className="hint warning" role="status">
        {name ? `"${name}"` : "This"} changed after you started writing: check before saving ·{" "}
        <button type="button" className="ra-more" onClick={draft.discard}>Start again from the current values</button>
      </p>
    );
  }
  return (
    <p className="hint" role="status">
      Unsaved changes kept from {timeOf(draft.keptAt)} ·{" "}
      <button type="button" className="ra-more" onClick={draft.discard}>Discard</button>
    </p>
  );
}
