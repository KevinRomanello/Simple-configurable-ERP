import { defineEvent, definePort } from "../../core/contracts";

// The two things the register asks of whatever is tied to its movements (the bridge to the budget): what each movement is tied to, and
// whether it may change. Defined here and not in `treasury.public.ts` so that the register's own services can use them without a cycle.

/** What a movement of the register is tied to: the expected inflow it received, and the budget lines it paid. */
export interface EntryLink {
  entryId: number;
  inflow: { id: number; sourceName: string } | null;
  lines: { lineId: number; item: string; cents: number }[];
}

/** The register shows what each movement is tied to, and that is the bridge's to say; without the bridge nothing is tied. */
export const entryLinks = definePort<Record<string, never>, EntryLink[]>("entryLinks", "treasury", () => []);

/**
 * A movement is about to change (its direction or its amount): whoever has tied it to something may refuse, by throwing. It reaches the
 * bridge even when the budget is off: the ties stay in the database, and a payment that became money in would still be paying lines when
 * the budget is turned on again.
 */
export const entryChanging = defineEvent<{ entryId: number; direction: "in" | "out"; cents: number }>("entryChanging", "data");
