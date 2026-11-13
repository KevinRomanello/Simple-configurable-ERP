import { describe, expect, it } from "vitest";
import type { ItemType } from "../api/types";
import { buildTree, canMove, typeLevels, withDescendants } from "./typeTree";

const type = (id: number, name: string, parentId: number | null): ItemType => ({
  id, name, parentId, depth: 0, path: name, areaId: null, hazards: true, categoryId: 1, category: "Components", items: 0, params: [],
});

// IC > Op-amp, Microcontroller > ARM; and Resistor on its own (the list is in the order of the tree)
const types = [type(1, "IC", null), type(3, "Microcontroller", 1), type(4, "ARM", 3), type(2, "Op-amp", 1), type(5, "Resistor", null)];

describe("buildTree", () => {
  it("makes the branches from the roots down, in the order of the list", () => {
    const tree = buildTree(types);
    expect(tree.map((b) => b.type.name)).toEqual(["IC", "Resistor"]);
    expect(tree[0]!.children.map((b) => b.type.name)).toEqual(["Microcontroller", "Op-amp"]);
    expect(tree[0]!.children[0]!.children.map((b) => b.type.name)).toEqual(["ARM"]);
    expect(tree[1]!.children).toEqual([]);
  });

  it("treats a type whose parent is not in the list as a root, so nothing is lost", () => {
    expect(buildTree([type(9, "Orphan", 99)]).map((b) => b.type.name)).toEqual(["Orphan"]);
  });
});

describe("withDescendants", () => {
  it("is the type and everything under it, at any depth", () => {
    expect([...withDescendants(types, 1)].sort()).toEqual([1, 2, 3, 4]);
    expect([...withDescendants(types, 3)].sort()).toEqual([3, 4]);
    expect([...withDescendants(types, 5)]).toEqual([5]);
  });
});

describe("canMove", () => {
  it("lets a type go under another one, or out to be a type of its own", () => {
    expect(canMove(types, 2, 5)).toBe(true); // Op-amp under Resistor
    expect(canMove(types, 4, 1)).toBe(true); // ARM up under IC
    expect(canMove(types, 4, null)).toBe(true);
  });

  it("does not let a type go under itself or under one of its own sub-types", () => {
    expect(canMove(types, 1, 1)).toBe(false);
    expect(canMove(types, 1, 4)).toBe(false); // IC under ARM, which is under IC
    expect(canMove(types, 3, 4)).toBe(false);
  });

  it("is nothing to do where the type already is, and for a type that does not exist", () => {
    expect(canMove(types, 2, 1)).toBe(false);
    expect(canMove(types, 5, null)).toBe(false);
    expect(canMove(types, 99, 1)).toBe(false);
  });
});

describe("typeLevels", () => {
  const names = (list: ItemType[]) => list.map((t) => t.name);

  it("is one menu with the types of no parent while nothing is chosen", () => {
    const levels = typeLevels(types, types, null);
    expect(levels).toHaveLength(1);
    expect(names(levels[0]!.options)).toEqual(["IC", "Resistor"]);
    expect(levels[0]!.parent).toBeNull();
    expect(levels[0]!.selected).toBeNull();
  });

  it("adds a menu with only the types under what is chosen, and so on down", () => {
    const [first, second] = typeLevels(types, types, 1);
    expect(first!.selected?.name).toBe("IC");
    expect(second!.parent?.name).toBe("IC");
    expect(names(second!.options)).toEqual(["Microcontroller", "Op-amp"]);
    expect(second!.selected).toBeNull();

    const levels = typeLevels(types, types, 4); // ARM, under Microcontroller, under IC
    expect(levels.map((l) => l.selected?.name ?? null)).toEqual(["IC", "Microcontroller", "ARM"]);
    expect(names(levels[1]!.options)).toEqual(["Microcontroller", "Op-amp"]); // the brothers of the one chosen stay to choose from
    expect(levels).toHaveLength(3); // nothing under ARM: no menu for a next level
  });

  it("has no menu for a next level when what is chosen has nothing under it", () => {
    expect(typeLevels(types, types, 5)).toHaveLength(1); // Resistor
    expect(typeLevels(types, types, 2)).toHaveLength(2); // Op-amp, under IC
  });

  it("offers only the visible types (those of the area), and keeps the chosen one in its menu", () => {
    const visible = types.filter((t) => t.name !== "Op-amp");
    expect(names(typeLevels(types, visible, 1)[1]!.options)).toEqual(["Microcontroller"]);
    // an Op-amp chosen before the area changed still shows in its menu
    expect(names(typeLevels(types, visible, 2)[1]!.options)).toEqual(["Microcontroller", "Op-amp"]);
    // a level whose types are all hidden has no menu
    expect(typeLevels(types, types.filter((t) => t.parentId === null), 1)).toHaveLength(1);
  });
});
