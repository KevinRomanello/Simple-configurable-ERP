import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The season chosen in the menu for the request being handled (its id, from the X-Season header),
 * or null for the current one. The season hook fills it before the route runs, so services ask for
 * the season with getCurrentSeason() and no argument, like for the user.
 */
export const seasonStorage = new AsyncLocalStorage<number | null>();
