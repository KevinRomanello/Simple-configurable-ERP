import type { ArrivalStatus } from "../../core/calcTypes";

// How the budget shows where the goods of a purchase are (`line.arrival`, which the bridge to the inventory fills on the server):
// a pill in the ARRIVED column and on the card of a line, and in PENDING (the bridge uses it from public.ts).

/** Where a purchase stands. "pending" is what the person calls bought and not arrived yet. */
const LABEL: Record<ArrivalStatus, string> = {
  planned: "planned",
  ordered: "pending",
  partial: "partial",
  received: "arrived",
  over: "too many",
};

export const arrivalTitle: Record<ArrivalStatus, string> = {
  planned: "Not bought yet",
  ordered: "Bought, nothing has arrived",
  partial: "Part of it has arrived",
  received: "Everything has arrived",
  over: "More has arrived than was bought: check the budget",
};

export function ArrivalPill({ status }: { status: ArrivalStatus }) {
  return <span className={`pill arrival-${status}`} title={arrivalTitle[status]}>{LABEL[status]}</span>;
}
