import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";

// Every picture of the site that a person can look at closely is drawn with these (a test checks that no page writes its own
// `<img`): a click on it opens the big one over the page, and a click anywhere, Esc or the X closes it. A click with Ctrl, Cmd
// or Shift, or the middle button, is still the link it is: it opens the picture in a new tab.

/** The big picture, over the page. Esc closes it. */
function Viewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // the panel under it must not close too
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return createPortal(
    // the page under it is made of React parents of this one (a card that opens a record): the click ends here
    <div className="viewer" role="dialog" aria-modal="true" aria-label={alt || "Picture"} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <IconButton autoFocus icon={faXmark} label="Close the picture" className="viewer-close" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <img src={src} alt={alt} />
    </div>,
    document.body,
  );
}

/**
 * Opening and closing the big picture, and the click that opens it (a plain click: the modified ones go to the link).
 * Closing gives the focus back to what was clicked.
 */
function useViewer() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);
  const show = (e: MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation(); // not also the click of the card or the row it is in
    opener.current = e.currentTarget as HTMLElement;
    setOpen(true);
  };
  return { open, close, show };
}

/** A picture on the page, small as it is drawn there (`src`), that opens the big one (`large`, by default the same file) when clicked. */
export function Picture({ src, large = src, alt, className }: { src: string; large?: string; alt: string; className?: string }) {
  const viewer = useViewer();
  return (
    <>
      <a className="picture-link" href={large} target="_blank" rel="noreferrer" aria-label={alt ? `Enlarge ${alt}` : "Enlarge the picture"} onClick={viewer.show}>
        <img className={className} src={src} alt={alt} loading="lazy" />
      </a>
      {viewer.open && <Viewer src={large} alt={alt} onClose={viewer.close} />}
    </>
  );
}

/** The same, for a picture that is named rather than drawn (a file attached to a record): the name opens the big one. */
export function PictureLink({ src, name, children }: { src: string; name: string; children?: ReactNode }) {
  const viewer = useViewer();
  return (
    <>
      <a href={src} target="_blank" rel="noreferrer" onClick={viewer.show}>{children ?? name}</a>
      {viewer.open && <Viewer src={src} alt={name} onClose={viewer.close} />}
    </>
  );
}
