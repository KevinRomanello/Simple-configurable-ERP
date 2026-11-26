import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { effectiveMode, openerButton, popoverPlace, useRowActionMode, type RowActionMode } from "../../lib/rowAction";
import { SCREEN, useMaxWidth } from "../../lib/screen";
import { IconButton } from "../Button";
import { InAction } from "./inAction";

// The panel of an action on a row (pay, receive, change…). A page writes <RowAction> right after the row the action belongs to and
// does not say how it opens: the person's choice does (lib/rowAction.ts), under the row, in a dialog, in a side panel or in a popover.
// Every shape holds the same card: what the action is and which row it is for, the data of the row, the form, and the buttons of the
// form (FormActions) always in sight at the bottom. docs/stile-interfaccia.md

interface CardProps {
  eyebrow: string;
  title: ReactNode;
  /** The data of the row the action is for, a strip under the title: name and value. */
  context?: [string, ReactNode][];
  onClose: () => void;
  /** Present on a popover: switches to the full form in a dialog. */
  more?: () => void;
  children: ReactNode;
}

function Card({ eyebrow, title, context, onClose, more, children }: CardProps) {
  return (
    <>
      <div className="ra-head">
        <div className="ra-title">
          <span className="eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        {more && <button type="button" className="ra-more" onClick={more}>More options</button>}
        <IconButton icon={faXmark} label="Close" onClick={onClose} />
      </div>
      {context && context.length > 0 && (
        <div className="ra-ctx">
          {context.map(([name, value]) => (
            <div key={name}>
              <span>{name}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      )}
      <div className="ra-body">
        <InAction.Provider value>{children}</InAction.Provider>
      </div>
    </>
  );
}

/** What every shape does the same way: takes the focus when it opens (and gives it back), and closes with Esc (not inside a box: there Esc is the box's). */
function useActionBehaviour(box: RefObject<HTMLElement | null>, onClose: () => void) {
  // the page passes a new function at every drawing: the effect below must not start again for that
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = openerButton();
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [role=listbox]")) return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      before?.focus?.({ preventScroll: true });
    };
  }, [box]);
}

/** B: a row of the table (or a block, in a list of cards) right after the row, as wide as the box that scrolls and not as the table. */
function Under({ colSpan, label, card, onClose }: { colSpan?: number; label: string; card: CardProps; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useActionBehaviour(box, onClose);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // a table wider than the page scrolls sideways in its box: the panel keeps to the part of it that is in sight
    const scroller = el.closest<HTMLElement>(".table-wrap");
    const fit = () => el.style.setProperty("--w", scroller ? `${scroller.clientWidth}px` : "100%");
    fit();
    const observer = new ResizeObserver(fit);
    if (scroller) observer.observe(scroller);
    el.scrollIntoView({ block: "nearest" });
    return () => observer.disconnect();
  }, []);
  const panel = (
    <div className="ra ra-under-box" role="group" aria-label={label} ref={box} tabIndex={-1}>
      <Card {...card} />
    </div>
  );
  return colSpan === undefined ? (
    <div className="ra-under">{panel}</div>
  ) : (
    <tr className="ra-row">
      <td colSpan={colSpan} className="ra-under">{panel}</td>
    </tr>
  );
}

/** A: in the middle of the screen. A click outside does not close it: a stray click would lose what was written. */
function Dialog({ label, card, onClose }: { label: string; card: CardProps; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useActionBehaviour(box, onClose);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  return createPortal(
    <div className="ra-scrim">
      <div className="ra ra-dialog" role="dialog" aria-modal="true" aria-label={label} ref={box} tabIndex={-1}>
        <Card {...card} />
      </div>
    </div>,
    document.body,
  );
}

/** C: from the right, over the page, which stays where it is and can be used. */
function Side({ label, card, onClose }: { label: string; card: CardProps; onClose: () => void }) {
  const box = useRef<HTMLElement>(null);
  useActionBehaviour(box, onClose);
  return createPortal(
    <aside className="ra ra-side" role="dialog" aria-label={label} ref={box} tabIndex={-1}>
      <Card {...card} />
    </aside>,
    document.body,
  );
}

/** D: a small card by the button that was pressed, followed when the page scrolls. */
function Popover({ anchor, label, card, onClose }: { anchor: HTMLElement; label: string; card: CardProps; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<ReturnType<typeof popoverPlace> | null>(null);
  useActionBehaviour(box, onClose);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const put = () => setPlace(popoverPlace(anchor.getBoundingClientRect(), { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
    // a table wider than the page may have the button out of sight at the right: bring it back first
    anchor.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    put();
    window.addEventListener("scroll", put, true);
    window.addEventListener("resize", put);
    const observer = new ResizeObserver(put);
    observer.observe(el);
    return () => {
      window.removeEventListener("scroll", put, true);
      window.removeEventListener("resize", put);
      observer.disconnect();
    };
  }, [anchor]);
  return createPortal(
    <div
      className={`ra ra-pop${place?.above ? " above" : ""}`}
      role="dialog"
      aria-label={label}
      ref={box}
      tabIndex={-1}
      style={place ? ({ top: place.top, left: place.left, "--arrow": `${place.arrow}px` } as React.CSSProperties) : { visibility: "hidden" }}
    >
      <Card {...card} />
    </div>,
    document.body,
  );
}

/**
 * The panel of an action on a row. Put it right after the row it belongs to: it opens as the person chose (under the row, dialog, side
 * panel or popover), and the page does not know which. `quick` is the short form of the action for the popover, which has room for a
 * few boxes only (without it the action opens as a dialog). `loose` is for an action that belongs to no row (the ticked lines, a new
 * field): there is nothing to open under, so it opens as a dialog. `colSpan` is the number of columns when it is put in a table.
 */
export function RowAction({ eyebrow, title, context, quick, onClose, colSpan, loose = false, mode, children }: {
  eyebrow: string;
  title: ReactNode;
  context?: [string, ReactNode][];
  quick?: ReactNode;
  onClose: () => void;
  colSpan?: number;
  loose?: boolean;
  /** Forces a mode, whatever the person chose (an action that only makes sense one way). */
  mode?: RowActionMode;
  children: ReactNode;
}) {
  const [chosen] = useRowActionMode();
  const phone = useMaxWidth(SCREEN.phone);
  const [more, setMore] = useState(false);
  // the button that was pressed to open it: the popover hangs from it
  const [anchor] = useState(openerButton);
  const asked = effectiveMode(mode ?? chosen, { anchored: !loose, quick: quick !== undefined && anchor !== null, phone });
  const actual = asked === "popover" && more ? "dialog" : asked;
  const popover = actual === "popover";
  const label = `${eyebrow}: ${typeof title === "string" ? title : eyebrow}`;
  const card: CardProps = { eyebrow, title, context, onClose, more: popover ? () => setMore(true) : undefined, children: popover ? quick : children };

  if (actual === "under") return <Under colSpan={colSpan} label={label} card={card} onClose={onClose} />;
  if (actual === "side") return <Side label={label} card={card} onClose={onClose} />;
  if (popover && anchor) return <Popover anchor={anchor} label={label} card={card} onClose={onClose} />;
  return <Dialog label={label} card={{ ...card, more: undefined, children }} onClose={onClose} />;
}
