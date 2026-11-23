/**
 * Where to scroll a list so that one of its rows shows: the least that does it, so a row already in sight
 * does not move. All the positions are in pixels inside the list's content (not on the screen).
 * A row taller than the list shows its top.
 */
export function scrollToReveal(scrollTop: number, viewHeight: number, rowTop: number, rowBottom: number): number {
  if (rowTop < scrollTop) return rowTop;
  if (rowBottom > scrollTop + viewHeight) return Math.min(rowTop, rowBottom - viewHeight);
  return scrollTop;
}
