import type { ItemType } from "../api/types";

// The types of the inventory as a tree to draw and to move things in. The list comes from the API already in the order of the
// tree; this file only turns it into branches and says what can be moved where. docs/inventario.md, §20

export interface TypeBranch {
  type: ItemType;
  children: TypeBranch[];
}

/** The branches from the roots down, in the order of the list. */
export function buildTree(types: ItemType[]): TypeBranch[] {
  const branch = new Map(types.map((t) => [t.id, { type: t, children: [] as TypeBranch[] }]));
  const roots: TypeBranch[] = [];
  for (const t of types) {
    const parent = t.parentId === null ? undefined : branch.get(t.parentId);
    (parent ? parent.children : roots).push(branch.get(t.id)!);
  }
  return roots;
}

/** The type and every type under it, at any depth. */
export function withDescendants(types: ItemType[], id: number): Set<number> {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of types) {
      if (t.parentId !== null && found.has(t.parentId) && !found.has(t.id)) {
        found.add(t.id);
        grew = true;
      }
    }
  }
  return found;
}

/**
 * Whether `id` can be put under `targetId` (null: made a type of its own): not under itself or one of its own sub-types, and
 * not where it already is. The server checks the rest (names and parameters that would be written twice).
 */
export function canMove(types: ItemType[], id: number, targetId: number | null): boolean {
  const moving = types.find((t) => t.id === id);
  if (!moving || moving.parentId === targetId) return false;
  return targetId === null || !withDescendants(types, id).has(targetId);
}

/** One menu of the search by type: the types to choose from at a level, and which is chosen. */
export interface TypeLevel {
  /** The type this level is under; null for the first level. */
  parent: ItemType | null;
  options: ItemType[];
  selected: ItemType | null;
}

/**
 * The menus of the search by type, one for each level: the first has the types of no parent, each next one only the types under
 * what is chosen in the one before, so it holds just the choices of that parent. The last menu is there only when what is
 * chosen has types under it. `visible` are the types the search offers (those of the area chosen); the chosen type always shows.
 */
export function typeLevels(all: ItemType[], visible: ItemType[], selectedId: number | null): TypeLevel[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  const chain: ItemType[] = [];
  for (let t = selectedId === null ? undefined : byId.get(selectedId); t && !chain.includes(t); t = t.parentId === null ? undefined : byId.get(t.parentId)) chain.unshift(t);
  const shown = new Set(visible.map((t) => t.id));
  const levels: TypeLevel[] = [];
  for (let i = 0; i <= chain.length; i += 1) {
    const parent = i === 0 ? null : chain[i - 1]!;
    const selected = chain[i] ?? null;
    const options = all.filter((t) => t.parentId === (parent?.id ?? null) && (shown.has(t.id) || t.id === selected?.id));
    if (options.length > 0) levels.push({ parent, options, selected });
  }
  return levels;
}

