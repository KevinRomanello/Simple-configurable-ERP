// How a person looks at the projects of an area: which ones are closed, and in which order. Only this browser knows it
// (nothing is written to the server), so these are plain functions over lists of project ids. docs/come-funziona.md

/** A list of ids as it was saved: anything that is not a list of whole numbers is "nothing" (the browser's storage can hold anything). */
export function parseIds(text: string | null): number[] {
  try {
    const saved: unknown = JSON.parse(text ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

/**
 * The projects in the order the person chose: the ones in `saved` first, in that order, then the rest in the order they
 * come (a new project goes last; an id that is no longer a project is ignored).
 */
export function orderProjects<T extends { id: number }>(projects: T[], saved: number[]): T[] {
  const rank = new Map(saved.map((id, index) => [id, index]));
  const chosen = projects.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...chosen, ...projects.filter((p) => !rank.has(p.id))];
}

/** The list with `id` taken out if it is there, put in if it is not. */
export const toggleId = (ids: number[], id: number): number[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** Where a project dropped here would land: next to the project `id`, after it or before it. */
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

/** The project nearest to the height `y` of the screen (`boxes`: where each one is) and whether `y` is in its lower half. */
export function dropTarget(boxes: { id: number; top: number; bottom: number }[], y: number): Drop | null {
  const distance = (box: { top: number; bottom: number }) => Math.max(box.top - y, y - box.bottom, 0);
  const nearest = boxes.reduce<(typeof boxes)[number] | null>((best, box) => (best === null || distance(box) < distance(best) ? box : best), null);
  return nearest && { id: nearest.id, after: y > (nearest.top + nearest.bottom) / 2 };
}
