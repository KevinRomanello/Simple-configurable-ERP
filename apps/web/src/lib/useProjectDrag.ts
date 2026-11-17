import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";
import { dropTarget, moveNear, type Drop } from "./projectView";

/** The pointer has to move this many pixels before a press on the handle becomes a drag (a plain click moves nothing). */
const DRAG_THRESHOLD = 5;

const boxOf = (id: number) => document.querySelector<HTMLElement>(`[data-project="${id}"]`);

/**
 * Moving a project in the list by its handle: press it, drag to where the project goes, let go. It works with the mouse
 * and with a finger (pointer events), and with the up and down arrow keys while the handle has the focus.
 * The box of each project carries `data-project` (its id). `ids`: the projects in the order they are shown; `onOrder` gets the new order when the handle is let go.
 */
export function useProjectDrag(ids: number[], onOrder: (ids: number[]) => void) {
  const [drag, setDrag] = useState<{ id: number; drop: Drop | null } | null>(null);
  const startY = useRef(0);
  const moved = useRef(false); // the press became a drag (it moved further than the threshold)
  const grab = useRef(0); // how far below the top of its box the pointer took the project
  const keep = useRef<{ id: number; top: number } | null>(null); // the project whose box has to be at this height of the screen

  // The projects fold when the drag begins and open again when it ends: the page changes height and the browser scrolls it
  // somewhere else. Put the project in hand back where it was (under the pointer), as the page is drawn.
  const draggedId = drag?.id;
  useLayoutEffect(() => {
    const kept = keep.current;
    keep.current = null;
    const top = kept ? boxOf(kept.id)?.getBoundingClientRect().top : undefined;
    if (kept && top !== undefined) window.scrollBy(0, top - kept.top);
  }, [draggedId]);

  /** Where the project `id` would land if it were let go at the height `y`; none where that changes nothing. */
  const dropAt = (id: number, y: number): Drop | null => {
    const boxes = [...document.querySelectorAll<HTMLElement>("[data-project]")].map((box) => {
      const { top, bottom } = box.getBoundingClientRect();
      return { id: Number(box.dataset.project), top, bottom };
    });
    const at = dropTarget(boxes, y);
    return at && moveNear(ids, id, at.id, at.after).join() !== ids.join() ? at : null;
  };

  /** The events of the handle of project `id`. */
  const handle = (id: number): HTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); // no text gets selected while the pointer travels over the page
      e.currentTarget.setPointerCapture(e.pointerId); // the handle keeps the pointer wherever it goes
      startY.current = e.clientY;
      moved.current = false;
    },
    onPointerMove: (e) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      if (!moved.current && Math.abs(e.clientY - startY.current) < DRAG_THRESHOLD) return;
      if (!moved.current) {
        const top = boxOf(id)?.getBoundingClientRect().top ?? 0;
        grab.current = startY.current - top;
        keep.current = { id, top };
      }
      moved.current = true;
      const drop = dropAt(id, e.clientY);
      // the page draws again only when the line moves to another place
      setDrag((now) => (now && now.drop?.id === drop?.id && now.drop?.after === drop?.after ? now : { id, drop }));
    },
    onPointerUp: (e) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const at = moved.current ? dropAt(id, e.clientY) : null;
      if (moved.current) keep.current = { id, top: e.clientY - grab.current };
      setDrag(null);
      if (at) onOrder(moveNear(ids, id, at.id, at.after));
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e) => {
      const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      const next = ids[ids.indexOf(id) + step];
      if (step === 0 || next === undefined) return;
      e.preventDefault();
      onOrder(moveNear(ids, id, next, step === 1));
    },
  });

  return { draggedId: draggedId ?? null, drop: drag?.drop ?? null, handle };
}
