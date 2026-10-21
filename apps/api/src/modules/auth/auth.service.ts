import { AppError, forbidden } from "../../core/errors";
import { userStorage } from "./auth.context";

export type Role = "admin" | "pm" | "viewer";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** The areas a `pm` may change. Ignored for the other roles. */
  areaIds: number[];
}

/** Who is making the request (GET /api/me). Answers 401 when nobody is signed in. */
export async function getCurrentUser(): Promise<User> {
  const user = userStorage.getStore();
  if (!user) throw new AppError(401, "Not signed in");
  return user;
}

/**
 * Whether `user` may change the data of an area (`areaId`) or the data shared by all areas
 * (`areaId` null: funds, contracts, inflows, BANK). Called before every write.
 *
 *   admin  everywhere
 *   pm     only the areas assigned to them, never the shared data
 *   viewer nothing
 */
export async function canWrite(user: User, areaId: number | null): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "pm") return areaId !== null && user.areaIds.includes(areaId);
  return false;
}

/** The supplier list is shared by every area, so project managers may keep it up to date. */
export async function canManageSuppliers(user: User): Promise<boolean> {
  return user.role !== "viewer";
}

/** The inventory is kept by the people who run the projects: admins and project managers. */
export async function canManageInventory(user: User): Promise<boolean> {
  return user.role !== "viewer";
}

/** The history of changes is for people who change things. */
export async function canViewHistory(user: User): Promise<boolean> {
  return user.role !== "viewer";
}

export function requireAdmin(user: User): void {
  if (user.role !== "admin") throw forbidden("Only an admin can do this");
}

/** What the interface needs to know to show or hide commands (the server enforces them anyway). */
export function permissionsOf(user: User) {
  return {
    canEditShared: user.role === "admin",
    canManageSuppliers: user.role !== "viewer",
    canManageInventory: user.role !== "viewer",
    canViewHistory: user.role !== "viewer",
    canManageUsers: user.role === "admin",
  };
}
