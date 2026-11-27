import { useCallback, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMe } from "../platform/auth";
import { DraftGuardContext } from "./draftGuard";
import { DISCARD_QUESTION, hasDraft, readDraft, removeDraft, sameValue, writeDraft } from "./drafts";

/** How long after the last key the draft is written: not at every key, and not so late that leaving the page loses the last words. */
const WRITE_AFTER_MS = 300;

export interface DraftControls {
  /** Throws the draft away and goes back to what the form started from (Save does it; the person does it with «Discard»). */
  discard: () => void;
  /** When the draft that was found at the start was kept; null for a form that started empty. */
  keptAt: number | null;
  /** The draft was started from something that is not what is there now: it changed meanwhile, so it must be looked at before saving. */
  stale: boolean;
  /** Something is written: the form is not at what it started from. */
  dirty: boolean;
  /** Runs `then` (the Cancel of the form), asking first when something is written, and throws the draft away. */
  leave: (then: () => void) => void;
}

/**
 * The state of a form, kept in this browser while it is typed (docs/stile-interfaccia.md): it is `useState`, except that the form
 * comes back with what was written when the page is left and opened again, and the box that holds the form asks before closing it
 * with something written. `key` says which form (and which thing it is for: «pay:12,13»), `initial` what an empty form is, `base`
 * what an edit started from (a version, the values read): if it is not the same when the draft is found, `stale` is true.
 */
export function useDraft<T>(key: string, initial: T, options: { base?: string | number | null } = {}): [T, Dispatch<SetStateAction<T>>, DraftControls] {
  const userId = useMe().id;
  const report = useContext(DraftGuardContext);
  const base = options.base == null ? null : String(options.base);
  const first = useRef<ReturnType<typeof readDraft<T>> | undefined>(undefined);
  if (first.current === undefined) first.current = readDraft<T>(userId, key);
  const [value, setRaw] = useState<T>(() => first.current?.value ?? initial);
  const [keptAt, setKeptAt] = useState<number | null>(first.current?.at ?? null);
  const startedFrom = useRef(initial);
  startedFrom.current = initial;
  const discarded = useRef(false);
  const dirty = !sameValue(value, initial);
  const stale = keptAt !== null && base !== null && first.current?.base !== base;

  const latest = useRef({ value, dirty, base });
  latest.current = { value, dirty, base };

  const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    discarded.current = false;
    setRaw(next);
  }, []);

  // written a little after the last change; back at what it started from, it is no draft
  useEffect(() => {
    if (!dirty) {
      removeDraft(userId, key);
      return;
    }
    const timer = setTimeout(() => writeDraft(userId, key, { value, at: Date.now(), base }), WRITE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [value, dirty, userId, key, base]);
  // leaving the page within the pause must not lose the last words
  useEffect(
    () => () => {
      const now = latest.current;
      if (now.dirty && !discarded.current) writeDraft(userId, key, { value: now.value, at: Date.now(), base: now.base });
    },
    [userId, key],
  );

  const discard = useCallback(() => {
    discarded.current = true;
    removeDraft(userId, key);
    setRaw(startedFrom.current);
    setKeptAt(null);
  }, [userId, key]);
  const leave = useCallback(
    (then: () => void) => {
      if (!sameValue(latest.current.value, startedFrom.current) && !window.confirm(DISCARD_QUESTION)) return;
      discard();
      then();
    },
    [discard],
  );

  // the box that holds the form (RowAction, AddSection) asks before closing, and throws the draft away if it is closed
  useEffect(() => report?.({ dirty, discard }), [report, dirty, discard]);

  return [value, setValue, { discard, keptAt, stale, dirty, leave }];
}

/** For a form kept as one object: `set("name")` is the change handler of one of its boxes. */
export const fieldSetter =
  <T,>(setForm: Dispatch<SetStateAction<T>>) =>
  <K extends keyof T>(name: K) =>
  (value: T[K]) =>
    setForm((form) => ({ ...form, [name]: value }));

/**
 * What is open on a page (which row has its panel open) is remembered like a draft, so that coming back to the page the panel is open and
 * its form has what was written. `draftKeyOf` says which form the open thing is (a key, a list of keys, or the start of keys ending
 * with «*»: see `hasDraft`): when that form has no draft there is nothing to come back to, and the page starts closed.
 */
export function useRemembered<T>(key: string, initial: T, draftKeyOf?: (value: T) => string | string[] | null): [T, (next: T) => void] {
  const userId = useMe().id;
  const name = `open:${key}`;
  const [value, setRaw] = useState<T>(() => {
    const found = readDraft<T>(userId, name)?.value;
    if (found === undefined || sameValue(found, initial)) return initial;
    const named = draftKeyOf?.(found) ?? null;
    const patterns = named === null ? [] : Array.isArray(named) ? named : [named];
    return draftKeyOf && !patterns.some((pattern) => hasDraft(userId, pattern)) ? initial : found;
  });
  const change = useCallback(
    (next: T) => {
      setRaw(next);
      if (sameValue(next, initial)) removeDraft(userId, name);
      else writeDraft(userId, name, { value: next, at: Date.now(), base: null });
    },
    [userId, name, initial],
  );
  return [value, change];
}
