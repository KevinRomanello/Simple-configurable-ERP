import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { popoverPlace } from "../rowAction";

/**
 * What a page, a section or a form is for, behind an ⓘ beside its title: it shows only when the ⓘ is clicked, so the work of the page
 * comes first (asked by the person on 28 November 2026). A click outside, Esc or the ⓘ again close it, and the focus goes back to the ⓘ.
 * A state the person must see (a read-only season, a warning) is not an explanation: it stays on the page, not in here.
 */
export function Info({ children, label = "What is this?" }: { children: ReactNode; label?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const id = useId();

  // by the ⓘ, its left edge on the ⓘ's, inside the screen; it follows the ⓘ when the page or a box scrolls
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const put = () => {
      const anchor = button.current?.getBoundingClientRect();
      const el = box.current;
      if (!anchor || !el) return;
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      const { left, top } = popoverPlace(anchor, size, { width: window.innerWidth, height: window.innerHeight }, 6, 8, "start");
      setPlace({ left, top });
    };
    put();
    box.current?.focus({ preventScroll: true });
    window.addEventListener("scroll", put, true);
    window.addEventListener("resize", put);
    return () => {
      window.removeEventListener("scroll", put, true);
      window.removeEventListener("resize", put);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    // caught first, so that Esc closes this and not also the dialog or the record it is in
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus({ preventScroll: true });
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`info-btn${open ? " on" : ""}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>
      {open &&
        createPortal(
          <div ref={box} id={id} className="info-pop" role="dialog" aria-label={label} tabIndex={-1} style={place ?? { visibility: "hidden" }}>
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
