import { createContext, useCallback, useRef, useState } from "react";
import { useMe } from "./auth";
import { DISCARD_QUESTION, readDraft } from "./drafts";

// A box that holds a form and can be closed (the panel of an action, the form that opens under a yellow button) must not lose
// what was written when it is closed by its X or by Esc: it asks first. It does not know the form: the form (`useDraft`) tells it
// whether something is written and how to throw it away, through this context.

export interface GuardState {
  dirty: boolean;
  discard: () => void;
}

export type GuardReport = (state: GuardState) => void;

export const DraftGuardContext = createContext<GuardReport | null>(null);

/** For the box: what to give the form (`report`, in the context) and how to run something that loses what is written (`run`), asking first. */
export function useGuard() {
  const state = useRef<GuardState>({ dirty: false, discard: () => {} });
  const report = useCallback<GuardReport>((next) => {
    state.current = next;
  }, []);
  const run = useCallback((then: () => void) => {
    if (state.current.dirty && !window.confirm(DISCARD_QUESTION)) return;
    state.current.discard();
    then();
  }, []);
  return { report, run };
}

/** For the box: what to give the form and how to close, asking first if something is written. */
export function useGuardedClose(onClose: () => void) {
  const { report, run } = useGuard();
  const close = useCallback(() => run(onClose), [run, onClose]);
  return { report, close };
}

/**
 * What the yellow button of a page or of a box does with its form: it opens it (already open if the form has a draft, so that coming back
 * to the page the form is there with what was written), and closing it with the button asks first when something is written. `hide` is
 * for the form's own Cancel and Save, which have already dealt with the draft.
 */
export function useAdder(draftKey?: string) {
  const userId = useMe().id;
  const [adding, setAdding] = useState(() => draftKey !== undefined && readDraft(userId, draftKey) !== null);
  const hide = useCallback(() => setAdding(false), []);
  const { report, close } = useGuardedClose(hide);
  return { adding, toggle: () => (adding ? close() : setAdding(true)), hide, report };
}
