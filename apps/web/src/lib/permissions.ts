import type { Me, Role } from "../api/types";

/** How a role is called on screen: the `pm` is a "user" (the Users page says the same). */
export const ROLE_NAME: Record<Role, string> = { admin: "admin", pm: "user", viewer: "viewer" };

/**
 * Whether the person may change the budget of an area. The same rule the server applies on every
 * write; here it only decides which commands to show (the server refuses the rest anyway).
 *   admin everywhere, pm only the areas assigned to them, viewer nowhere.
 */
export function canEditArea(me: Me, areaId: number): boolean {
  if (me.readOnly) return false;
  if (me.role === "admin") return true;
  return me.role === "pm" && me.areaIds.includes(areaId);
}

/** Whether the site is shown read-only on this screen: an admin turned editing off for phones, and this is one. */
export const isReadOnlyHere = (me: Me, phone: boolean) => phone && !me.editOnPhone;

/**
 * The person as the interface sees them when the site is read-only on this screen: everything that changes something is off
 * (and `canEditArea` says no), what only looks stays. A guard against stray taps, not a permission: the server decides.
 */
export function lockEditing(me: Me): Me {
  return {
    ...me,
    readOnly: true,
    areaIds: [],
    permissions: {
      ...me.permissions,
      canEditShared: false,
      canManageCash: false,
      canManageSuppliers: false,
      canManageInventory: false,
      canManageUsers: false,
      canManageSettings: false,
    },
  };
}
