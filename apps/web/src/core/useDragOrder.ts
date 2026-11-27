import { useId, useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";
import { dropTarget, moveNear, type Drop } from "../modules/budget/projectView";

/** The pointer has to move this many pixels before a press on the handle becomes a drag (a plain click moves nothing). */
const DRAG_THRESHOLD = 5;

/**
 * Moving an item of a list (a project of the budget, a row of a table) by its handle: press it, drag to where the item goes,
 * let go. It works with the mouse and with a finger (pointer events), and with the up and down arrow keys while the handle
 * has the focus. The box of each item (a project's panel, a table row) takes `boxProps(id)`, so that the drag can see where
 * it is, and `classOf(id)` for the way it looks while it is in hand or where the line lands. `ids`: the items in the order
 * they are shown; `onOrder` gets the new order when the handle is let go. Every list has its own `group`, so that two lists
 * on a page do not mix. `folds`: the page folds the items while one is in hand (the projects of the budget), so the item
 * in hand is kept under the pointer when the page changes height; the new order has to be there as soon as `onOrder` is called.
 */
export function useDragOrder(ids: number[], onOrder: (ids: number[]) => void, { folds = false } = {}) {
  const group = useId();
  const boxOf = (id: number) => document.querySelector<HTMLElement>(`[data-drag="${group}"][data-drag-id="${id}"]`);
  const [drag, setDrag] = useState<{ id: number; drop: Drop | null } | null>(null);
  const startY = useRef(0);
  const moved = useRef(false); // the press became a drag (it moved further than the threshold)
  const grab = useRef(0); // how far below the top of its box the pointer took the item
  const keep = useRef<{ id: number; top: number } | null>(null); // the item whose box has to be at this height of the screen

  // Where the items fold when the drag begins and open again when it ends, the page changes height and the browser scrolls
  // it somewhere else. Put the item in hand back where it was (under the pointer), as the page is drawn.
  const draggedId = drag?.id;
  useLayoutEffect(() => {
    const kept = keep.current;
    keep.current = null;
    const top = kept ? boxOf(kept.id)?.getBoundingClientRect().top : undefined;
    if (kept && top !== undefined) window.scrollBy(0, top - kept.top);
  }, [draggedId]);

  /** Where the item `id` would land if it were let go at the height `y`; none where that changes nothing. */
  const dropAt = (id: number, y: number): Drop | null => {
    const boxes = [...document.querySelectorAll<HTMLElement>(`[data-drag="${group}"]`)].map((box) => {
      const { top, bottom } = box.getBoundingClientRect();
      return { id: Number(box.dataset.dragId), top, bottom };
    });
    const at = dropTarget(boxes, y);
    return at && moveNear(ids, id, at.id, at.after).join() !== ids.join() ? at : null;
  };

  /** The events of the handle of item `id`. */
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
        if (folds) keep.current = { id, top };
      }
      moved.current = true;
      const drop = dropAt(id, e.clientY);
      // the page draws again only when the line moves to another place
      setDrag((now) => (now && now.drop?.id === drop?.id && now.drop?.after === drop?.after ? now : { id, drop }));
    },
    onPointerUp: (e) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const at = moved.current ? dropAt(id, e.clientY) : null;
      if (moved.current && folds) keep.current = { id, top: e.clientY - grab.current };
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

  /** What the box of item `id` carries for the drag to find it. */
  const boxProps = (id: number) => ({ "data-drag": group, "data-drag-id": id });

  /** The classes of the box of item `id`: faded while it is in hand, with the line above or below it where the item in hand lands. */
  const classOf = (id: number) =>
    [drag?.id === id && "dragging", drag?.drop?.id === id && (drag.drop.after ? "drop-after" : "drop-before")].filter(Boolean).join(" ");

  return { draggedId: draggedId ?? null, handle, boxProps, classOf };
}
