import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { api } from "../api/client";
import type { Season } from "../api/types";
import { useMe } from "./auth";
import { chosenSeasonId, setChosenSeasonId, subscribeSeasonChoice } from "./seasonChoice";

// The season the whole site shows, chosen in the menu. docs/stagioni-anni-fiscali-e-macchine.md

export function useSeasons() {
  return useQuery({ queryKey: ["seasons"], queryFn: api.seasons });
}

/** The id of the season chosen in the menu, null for the season of today; kept up to date when it changes. */
export function useChosenSeasonId() {
  return useSyncExternalStore(subscribeSeasonChoice, chosenSeasonId);
}

/** The season every page shows: the one chosen in the menu, or the season of today. Undefined while loading. */
export function useSeason(): Season | undefined {
  const chosen = useChosenSeasonId();
  const { data } = useSeasons();
  return data?.find((s) => s.id === chosen) ?? data?.find((s) => s.current);
}

/** Whether the budget of the season shown can be changed: not when an admin made it read-only. */
export function useSeasonOpen(): boolean {
  return useSeason()?.readOnly !== true;
}

/** Whether the person may change the sponsors and the cash flow of the season shown. */
export function useCanEditShared(): boolean {
  const open = useSeasonOpen();
  return useMe().permissions.canEditShared && open;
}

/** Whether the person may change the BANK and the inflows of the season shown: the team's money is the treasury's. */
export function useCanManageCash(): boolean {
  const open = useSeasonOpen();
  return useMe().permissions.canManageCash && open;
}

/**
 * Shows another season: every page reads its data again (who is signed in stays). Choosing the
 * season of today forgets the choice, so next September the site moves on by itself.
 */
export function useChooseSeason() {
  const queryClient = useQueryClient();
  return useCallback(
    (season: Season | null) => {
      setChosenSeasonId(season === null || season.current ? null : season.id);
      void queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "sign-in-options" });
    },
    [queryClient],
  );
}

/** "EG-25 · 2025-2026": a car as the lists show it (two seasons can have the same car). */
export const carLabel = (season: Pick<Season, "car" | "name">) => `${season.car} · ${season.name}`;
