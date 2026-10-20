import type { Me } from "../api/types";

/**
 * Whether the person may change the budget of an area. The same rule the server applies on every
 * write; here it only decides which commands to show (the server refuses the rest anyway).
 *   admin everywhere, pm only the areas assigned to them, viewer nowhere.
 */
export function canEditArea(me: Me, areaId: number): boolean {
  if (me.role === "admin") return true;
  return me.role === "pm" && me.areaIds.includes(areaId);
}
