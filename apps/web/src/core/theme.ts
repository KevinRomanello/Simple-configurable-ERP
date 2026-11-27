import { useCallback, useState } from "react";

// The look of the site: light, dark, or whatever the system says. The choice is made in Settings by anyone and kept in this
// browser only (it is a convenience: without it the site follows the system). The colours are in theme/tokens.css, which
// reads the `data-theme` attribute this file sets. docs/stile-interfaccia.md

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "erp.theme";

const isChoice = (value: unknown): value is ThemeChoice => value === "system" || value === "light" || value === "dark";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** What was chosen in this browser; "system" when nothing was, or when the browser does not let the site remember. */
export function readTheme(store?: Store): ThemeChoice {
  try {
    const saved = (store ?? localStorage).getItem(THEME_KEY);
    return isChoice(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

/** Remembers the choice ("system" forgets it). It works without the browser's storage: the choice is then for this visit only. */
export function saveTheme(choice: ThemeChoice, store?: Store) {
  try {
    const target = store ?? localStorage;
    if (choice === "system") target.removeItem(THEME_KEY);
    else target.setItem(THEME_KEY, choice);
  } catch {
    // private window or blocked storage: nothing to remember with
  }
}

/** Puts the choice on the page: the attribute the tokens read, none for "system" (the page then follows the system). */
export function applyTheme(choice: ThemeChoice, root: Pick<HTMLElement, "setAttribute" | "removeAttribute"> = document.documentElement) {
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/** The choice of this browser and how to change it; a change shows at once and is remembered. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme());
  const change = useCallback((next: ThemeChoice) => {
    setChoice(next);
    saveTheme(next);
    applyTheme(next);
  }, []);
  return [choice, change];
}
