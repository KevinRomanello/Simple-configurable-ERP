import { describe, expect, it } from "vitest";
import { dropTarget, moveNear, orderProjects, parseIds, toggleId } from "./projectView";

const projects = (...ids: number[]) => ids.map((id) => ({ id, name: `P${id}` }));
const idsOf = (list: { id: number }[]) => list.map((p) => p.id);

describe("orderProjects", () => {
  it("keeps the order of the budget when nothing was chosen", () => {
    expect(idsOf(orderProjects(projects(1, 2, 3), []))).toEqual([1, 2, 3]);
  });

  it("puts the projects in the order chosen", () => {
    expect(idsOf(orderProjects(projects(1, 2, 3), [3, 1, 2]))).toEqual([3, 1, 2]);
  });

  it("puts a project that is not in the chosen order last (a new one), in the order of the budget", () => {
    expect(idsOf(orderProjects(projects(1, 2, 3, 4, 5), [3, 1]))).toEqual([3, 1, 2, 4, 5]);
  });

  it("ignores an id that is no longer a project, or belongs to another season", () => {
    expect(idsOf(orderProjects(projects(1, 2), [9, 2, 8, 1]))).toEqual([2, 1]);
  });

  it("does not change the list it is given", () => {
    const list = projects(1, 2, 3);
    orderProjects(list, [3, 2, 1]);
    expect(idsOf(list)).toEqual([1, 2, 3]);
  });
});

describe("toggleId", () => {
  it("adds an id that is not there and takes out one that is", () => {
    expect(toggleId([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleId([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleId([], 5)).toEqual([5]);
  });
});

describe("parseIds", () => {
  it("reads a saved list, and anything else is an empty one", () => {
    expect(parseIds("[3,1,2]")).toEqual([3, 1, 2]);
    expect(parseIds(null)).toEqual([]);
    expect(parseIds("not json")).toEqual([]);
    expect(parseIds('{"a":1}')).toEqual([]);
    expect(parseIds('[1,"2",null,2.5,3]')).toEqual([1, 3]);
  });
});

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
