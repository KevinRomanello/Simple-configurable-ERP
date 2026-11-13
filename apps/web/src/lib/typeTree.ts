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
