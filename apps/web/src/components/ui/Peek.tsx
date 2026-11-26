import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../Button";
import { InAction } from "./inAction";

/**
 * The details of one thing, in a big rectangle in the middle of the screen, over everything else (the expanded record of NocoDB):
 * the page behind is darkened and keeps still. Closed by its X, by Esc or by a click outside it. It has a title at the top, with
 * what comes before it (`leading`: the arrows to the record before and after) and what you can do with it (`actions`); its body
 * is `children`, and `side` is a column at the right (comments), which on a phone goes under it. On a phone it takes the screen.
 */
export function Peek({ label, title, leading, actions, side, onClose, children }: {
  /** What it is for a screen reader: «Record». */
  label: string;
  title: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  side?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // the page passes a new function at every drawing: the effect below must not start again for that
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    const key = (e: KeyboardEvent) => {
      // Esc in a box being written in (a search, a list) is for that box, not for the whole record
      if (e.key !== "Escape" || (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [role=listbox]")) return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="peek-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="peek" role="dialog" aria-modal="true" aria-label={label} ref={box} tabIndex={-1}>
        <header className="peek-head">
          {leading}
          <h2>{title}</h2>
          <span className="spacer" />
          {actions}
          <IconButton icon={faXmark} label="Close" onClick={onClose} />
        </header>
        <div className="peek-body">
          <div className="peek-main">
            <InAction.Provider value>{children}</InAction.Provider>
          </div>
          {side && <aside className="peek-side">{side}</aside>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
