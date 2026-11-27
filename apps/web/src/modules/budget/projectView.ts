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
