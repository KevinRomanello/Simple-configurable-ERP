import type { RelatedInflows, RelatedVoice } from "./types";

// The panel that deletes an inflow of CASH FLOW lists everything of the company (expected, actual, movements of the register) and the
// person ticks what goes. What is ticked at the start, what «Tick all» ticks and what is sent are decided here, once.

export const voiceKey = (voice: Pick<RelatedVoice, "kind" | "id">) => `${voice.kind}:${voice.id}`;

/** Every voice, in the order the panel shows them. */
export const allVoices = (related: RelatedInflows): RelatedVoice[] => [...related.expected, ...related.actual, ...related.register];

/** What is ticked when the panel opens: only the row that was pressed (the way it was before: one thing), if it can be deleted. */
export function startingTicks(related: RelatedInflows): Set<string> {
  return new Set(allVoices(related).filter((v) => v.pressed && v.canDelete).map(voiceKey));
}

/** «Tick all»: everything that can be deleted. */
export function tickAll(related: RelatedInflows): Set<string> {
  return new Set(allVoices(related).filter((v) => v.canDelete).map(voiceKey));
}

/** What to send: the ticked voices by kind. A voice that cannot be deleted is never sent, even if it was ticked. */
export function deleteBody(related: RelatedInflows, ticked: Set<string>): { inflowIds: number[]; cashEntryIds: number[] } {
  const chosen = allVoices(related).filter((v) => v.canDelete && ticked.has(voiceKey(v)));
  return {
    inflowIds: chosen.filter((v) => v.kind === "inflow").map((v) => v.id),
    cashEntryIds: chosen.filter((v) => v.kind === "entry").map((v) => v.id),
  };
}

/** What the person is told above the button when movements of the register are ticked: that is a bigger thing than an inflow. */
export function registerWarning(related: RelatedInflows, ticked: Set<string>): string | null {
  const { cashEntryIds } = deleteBody(related, ticked);
  if (cashEntryIds.length === 0) return null;
  return `${cashEntryIds.length} ${cashEntryIds.length === 1 ? "movement" : "movements"} of the register will be deleted: the balances of the register change.`;
}
