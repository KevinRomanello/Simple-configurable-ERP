// What is typed in a form is kept in this browser while it is typed, so that going to another page (or a closed window) does not lose it.
// A draft belongs to a person (a computer is shared), lasts a day and goes at the logout. This file is only the store: the hook that
// forms use is `useDraft`, and the question «discard what you wrote?» is `lib/draftGuard.tsx`. docs/stile-interfaccia.md

/** What is kept for one form: the typed values, when they were last changed, and what they were started from (see `stale`). */
export interface Draft<T = unknown> {
  value: T;
  at: number;
  /** What the draft was started from (the version of a line, the values of a record): a different one now means that the thing changed meanwhile. */
  base: string | null;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function draftRules() {
  // HARDCODED: how long a draft is kept; a setting of the site, when somebody wants it longer or shorter
  return { maxAgeMs: 24 * 60 * 60 * 1000 };
}

const PREFIX = "erp.draft:";

/** The name a form's draft has in the browser: the person first, so that two people on one computer never see each other's. */
export const draftStoreKey = (userId: number, key: string) => `${PREFIX}${userId}:${key}`;

/** The draft of a form, if there is one that is not too old (an old one is thrown away as it is read). */
export function readDraft<T>(userId: number, key: string, now: number = Date.now(), store?: Store): Draft<T> | null {
  try {
    const target = store ?? localStorage;
    const raw = target.getItem(draftStoreKey(userId, key));
    if (raw === null) return null;
    const draft = JSON.parse(raw) as Draft<T>;
    if (typeof draft?.at !== "number" || now - draft.at > draftRules().maxAgeMs) {
      target.removeItem(draftStoreKey(userId, key));
      return null;
    }
    return draft;
  } catch {
    return null; // the browser does not allow storage, or what was there is not a draft: the form works as it always did
  }
}

/**
 * Whether a form has a draft. `pattern` is the key of the form, or, ending with «*», the start of the keys of a kind of form (a panel of
 * settings where any of several forms may have been written in).
 */
export function hasDraft(userId: number, pattern: string, now: number = Date.now(), store?: Store): boolean {
  if (!pattern.endsWith("*")) return readDraft(userId, pattern, now, store) !== null;
  try {
    const target = store ?? localStorage;
    const owner = draftStoreKey(userId, "");
    const start = draftStoreKey(userId, pattern.slice(0, -1));
    const keys: string[] = [];
    for (let i = 0; i < target.length; i++) {
      const name = target.key(i);
      if (name?.startsWith(start)) keys.push(name.slice(owner.length));
    }
    return keys.some((key) => readDraft(userId, key, now, target) !== null);
  } catch {
    return false;
  }
}

export function writeDraft<T>(userId: number, key: string, draft: Draft<T>, store?: Store) {
  try {
    (store ?? localStorage).setItem(draftStoreKey(userId, key), JSON.stringify(draft));
  } catch {
    // private window, blocked or full storage: nothing is kept
  }
}

export function removeDraft(userId: number, key: string, store?: Store) {
  try {
    (store ?? localStorage).removeItem(draftStoreKey(userId, key));
  } catch {
    // nothing to remove from
  }
}

/** The logout: every draft of this browser goes (whoever's it was), and so does what was remembered as open. */
export function dropAllDrafts(store?: Store) {
  try {
    const target = store ?? localStorage;
    const names: string[] = [];
    for (let i = 0; i < target.length; i++) {
      const name = target.key(i);
      if (name?.startsWith(PREFIX)) names.push(name);
    }
    for (const name of names) target.removeItem(name);
  } catch {
    // nothing to drop
  }
}

/** The same values, written the same way: the draft of a form that is back at what it started from is no draft. */
export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** «14:32»: the time of day a draft was kept from. */
export function timeOf(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** What to ask before throwing away what was written. */
export const DISCARD_QUESTION = "Discard what you wrote?";
