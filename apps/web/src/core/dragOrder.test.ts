import { describe, expect, it } from "vitest";
import { dropTarget, moveNear } from "./dragOrder";

describe("moveNear", () => {
  it("puts a project before another one, or after it", () => {
    expect(moveNear([1, 2, 3, 4], 4, 2, false)).toEqual([1, 4, 2, 3]);
    expect(moveNear([1, 2, 3, 4], 1, 3, true)).toEqual([2, 3, 1, 4]);
  });

  it("moves a project to the very top and to the very bottom", () => {
    expect(moveNear([1, 2, 3], 3, 1, false)).toEqual([3, 1, 2]);
    expect(moveNear([1, 2, 3], 1, 3, true)).toEqual([2, 3, 1]);
  });

  it("leaves the order alone when the project goes where it already is", () => {
    expect(moveNear([1, 2, 3], 2, 3, false)).toEqual([1, 2, 3]);
    expect(moveNear([1, 2, 3], 2, 1, true)).toEqual([1, 2, 3]);
  });

  it("leaves the order alone for a project on itself or one that is not in the list", () => {
    expect(moveNear([1, 2, 3], 2, 2, true)).toEqual([1, 2, 3]);
    expect(moveNear([1, 2, 3], 9, 1, false)).toEqual([1, 2, 3]);
    expect(moveNear([1, 2, 3], 1, 9, false)).toEqual([1, 2, 3]);
  });

  it("does not change the list it is given", () => {
    const list = [1, 2, 3];
    moveNear(list, 3, 1, false);
    expect(list).toEqual([1, 2, 3]);
  });
});

describe("dropTarget", () => {
  const boxes = [{ id: 1, top: 0, bottom: 100 }, { id: 2, top: 140, bottom: 240 }, { id: 3, top: 280, bottom: 380 }];

  it("tells the project under the pointer and which half of it", () => {
    expect(dropTarget(boxes, 20)).toEqual({ id: 1, after: false });
    expect(dropTarget(boxes, 200)).toEqual({ id: 2, after: true });
  });

  it("picks the nearest project when the pointer is between two", () => {
    expect(dropTarget(boxes, 110)).toEqual({ id: 1, after: true });
    expect(dropTarget(boxes, 130)).toEqual({ id: 2, after: false });
  });

  it("takes the first project above the list and the last one below it", () => {
    expect(dropTarget(boxes, -50)).toEqual({ id: 1, after: false });
    expect(dropTarget(boxes, 900)).toEqual({ id: 3, after: true });
  });

  it("has no target when there are no projects", () => {
    expect(dropTarget([], 10)).toBeNull();
  });
});
