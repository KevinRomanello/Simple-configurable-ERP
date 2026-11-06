// The season chosen in the menu, remembered in this browser: null shows the season of today. The
// API client sends it with every request (X-Season), so it lives here without any import.

const KEY = "erp.season";
const listeners = new Set<() => void>();

function read(): number | null {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null; // private window or blocked storage: the season of today
  }
}

let chosen = read();

export const chosenSeasonId = () => chosen;

export function setChosenSeasonId(id: number | null) {
  chosen = id;
  try {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
  } catch {
    // not remembered: the choice lasts until the page is reloaded
  }
  for (const listener of listeners) listener();
}

export function subscribeSeasonChoice(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
