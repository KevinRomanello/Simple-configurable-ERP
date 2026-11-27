// The order of a list changed by dragging an item (`useDragOrder`): where it lands and the list that comes out. Pure, with its tests.

/** Where an item dropped here would land: next to the item `id`, after it or before it. */
export interface Drop {
  id: number;
  after: boolean;
}

/** The list with `id` taken out and put before `target` (or after it); the list as it was when `id` or `target` is not in it. */
export function moveNear(ids: number[], id: number, target: number, after: boolean): number[] {
  if (id === target || !ids.includes(id) || !ids.includes(target)) return ids;
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(target) + (after ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** The item nearest to the height `y` of the screen (`boxes`: where each one is) and whether `y` is in its lower half. */
export function dropTarget(boxes: { id: number; top: number; bottom: number }[], y: number): Drop | null {
  const distance = (box: { top: number; bottom: number }) => Math.max(box.top - y, y - box.bottom, 0);
  const nearest = boxes.reduce<(typeof boxes)[number] | null>((best, box) => (best === null || distance(box) < distance(best) ? box : best), null);
  return nearest && { id: nearest.id, after: y > (nearest.top + nearest.bottom) / 2 };
}
