import { useSyncExternalStore } from "react";

/**
 * The widths where the layout changes, in px (the largest width of each). The same numbers are in
 * theme/components.css, in the media queries of "small screens": change them together.
 *   - tablet: the menu becomes a panel opened from the bar at the top;
 *   - phone: the menu takes the whole screen, the budget is shown as cards;
 *   - cards: the tables become one card per row.
 */
export const SCREEN = { tablet: 1099, phone: 767, cards: 599 } as const;

/** Whether the window is at most `px` wide, kept up to date when it is resized or turned. */
export function useMaxWidth(px: number): boolean {
  const query = `(max-width: ${px}px)`;
  return useSyncExternalStore(
    (changed) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", changed);
      return () => list.removeEventListener("change", changed);
    },
    () => window.matchMedia(query).matches,
  );
}
