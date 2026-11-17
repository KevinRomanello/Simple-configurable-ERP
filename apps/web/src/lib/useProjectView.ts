import { useState } from "react";
import { parseIds, toggleId } from "./projectView";

const closedKey = (areaCode: string) => `erp.closedProjects.${areaCode}`;
const orderKey = (areaCode: string) => `erp.projectOrder.${areaCode}`;

const read = (key: string): number[] => {
  try {
    return parseIds(localStorage.getItem(key));
  } catch {
    return []; // blocked storage: nothing is remembered
  }
};
const write = (key: string, ids: number[]) => {
  try {
    if (ids.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // private window or blocked storage: the choice only lasts until the page is closed
  }
};

/**
 * The projects of an area the way this person arranged them: which are closed (only their subtotal shows) and the order
 * of the list. Both are remembered in this browser, for each area, and change nothing for anybody else.
 */
export function useProjectView(areaCode: string) {
  const load = () => ({ areaCode, closed: read(closedKey(areaCode)), order: read(orderKey(areaCode)) });
  const [view, setView] = useState(load);
  // the page is the same one for every area: another area has its own lists
  if (view.areaCode !== areaCode) setView(load());

  const setClosed = (closed: number[]) => {
    write(closedKey(areaCode), closed);
    setView({ ...view, closed });
  };
  const setOrder = (order: number[]) => {
    write(orderKey(areaCode), order);
    setView({ ...view, order });
  };
  return {
    closed: view.closed,
    order: view.order,
    toggle: (id: number) => setClosed(toggleId(view.closed, id)),
    /** Closes every project of `ids`, or opens them all. */
    setAll: (ids: number[], closed: boolean) => setClosed(closed ? [...new Set([...view.closed, ...ids])] : view.closed.filter((id) => !ids.includes(id))),
    setOrder,
    resetOrder: () => setOrder([]),
  };
}
