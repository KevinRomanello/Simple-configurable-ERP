import { useCallback, useSyncExternalStore } from "react";

// How an action on a row opens (pay, receive, change…): under the row, in a dialog, in a side panel or in a small popover next to its
// button. The choice is made in Settings › App › Appearance by anyone and kept in this browser only, like the theme. The shapes are in
// components/ui/RowAction.tsx; this file says which one is wanted and where the popover goes. docs/stile-interfaccia.md

export type RowActionMode = "under" | "dialog" | "side" | "popover";

export const ROW_ACTION_MODES: { value: RowActionMode; label: string }[] = [
  { value: "under", label: "Under the row" },
  { value: "dialog", label: "Dialog" },
  { value: "side", label: "Side panel" },
  { value: "popover", label: "Popover" },
];

export const ROW_ACTION_KEY = "erp.rowActionMode";

/** Told to the pages already open when the choice changes (the `storage` event only reaches the other tabs). */
const CHANGED = "erp:row-action-mode";

const isMode = (value: unknown): value is RowActionMode => ROW_ACTION_MODES.some((m) => m.value === value);

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** How an action on a row opens in this browser. */
export function rowActionMode(store?: Store): RowActionMode {
  // HARDCODED: the mode chosen in the settings of the site (or of the person); for now each browser chooses, and without a choice it is under the row
  try {
    const saved = (store ?? localStorage).getItem(ROW_ACTION_KEY);
    return isMode(saved) ? saved : "under";
  } catch {
    return "under"; // the browser may not allow storage (private window): the choice is then for this visit only, see useRowActionMode
  }
}

/** Remembers the choice; "under" (the one without a choice) forgets it. */
export function saveRowActionMode(mode: RowActionMode, store?: Store) {
  try {
    const target = store ?? localStorage;
    if (mode === "under") target.removeItem(ROW_ACTION_KEY);
    else target.setItem(ROW_ACTION_KEY, mode);
  } catch {
    // private window or blocked storage: nothing to remember with
  }
}

/** The mode of this browser, kept up to date when it is changed here or in another tab, and how to change it. */
export function useRowActionMode(): [RowActionMode, (mode: RowActionMode) => void] {
  const mode = useSyncExternalStore(
    (changed) => {
      window.addEventListener(CHANGED, changed);
      window.addEventListener("storage", changed);
      return () => {
        window.removeEventListener(CHANGED, changed);
        window.removeEventListener("storage", changed);
      };
    },
    () => rowActionMode(),
  );
  const change = useCallback((next: RowActionMode) => {
    saveRowActionMode(next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [mode, change];
}

// The button that was pressed last. The popover hangs from it, and the focus goes back to it when the panel closes. The focus itself
// is no help: on Safari and on Firefox for the Mac a click does not focus a button. The listener runs before the page's own (capture).
let lastButton: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("click", (event) => (lastButton = (event.target as HTMLElement | null)?.closest?.("button") ?? null), true);
}

/** The button that opened the panel being drawn: the last one pressed, if it is still on the page, otherwise what has the focus. */
export function openerButton(): HTMLElement | null {
  if (lastButton?.isConnected) return lastButton;
  return document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
}

/** What an action really opens as, when the mode asked for cannot be: see the rules in the body. */
export function effectiveMode(wanted: RowActionMode, { anchored, quick, phone }: { anchored: boolean; quick: boolean; phone: boolean }): RowActionMode {
  // a popover is a small card by a button: on a phone it would be a sliver, so the dialog (which takes the screen) is what it is
  if (wanted === "popover" && phone) return "dialog";
  // a popover holds only the quick form of an action (a few boxes); an action without one opens as a dialog
  if (wanted === "popover" && !quick) return "dialog";
  // under the row needs a row: an action that belongs to none (the ticked lines, a new field) opens as a dialog
  if (wanted === "under" && !anchored) return "dialog";
  return wanted;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where the popover of a button goes on the screen (`fixed` position): below the button with its right edge on the button's, kept inside
 * the screen, and above the button when there is no room below. `arrow` is how far from its left edge the pointer to the button is.
 */
export function popoverPlace(button: Box, size: { width: number; height: number }, screen: { width: number; height: number }, gap = 8, margin = 8) {
  const left = Math.max(margin, Math.min(screen.width - size.width - margin, button.right - size.width));
  const below = button.bottom + gap;
  const above = button.top - gap - size.height;
  const fitsBelow = below + size.height + margin <= screen.height;
  const top = fitsBelow || above < margin ? Math.max(margin, Math.min(below, screen.height - size.height - margin)) : above;
  const arrow = Math.max(12, Math.min(size.width - 24, (button.left + button.right) / 2 - left - 5));
  return { left, top, arrow, above: !fitsBelow && above >= margin };
}
