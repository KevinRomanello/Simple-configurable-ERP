import { AppError, forbidden } from "../../core/errors";
import { can } from "../platform.public";
import { userStorage } from "./auth.context";

export type Role = "admin" | "pm" | "viewer";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** The areas a `pm` may change. Ignored for the other roles. */
  areaIds: number[];
  /** The boxes ticked for the person (`treasury`: keeps the money of the team; `sponsors`: keeps the funds). The modules say which boxes there are. */
  flags: string[];
}

/** Whether the box `key` is ticked for `user`. */
export const hasFlag = (user: User, key: string) => user.flags.includes(key);

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
 * A project manager with the treasury box also keeps the money of the team (canManageCash), and one with the
 * sponsors box keeps the funds of the sponsors (canManageFunds): neither opens the shared data to `canWrite`.
 */
export async function canWrite(user: User, areaId: number | null): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "pm") return areaId !== null && user.areaIds.includes(areaId);
  return false;
}

/** The people who run the projects: admins and project managers (a viewer only looks). */
const runsProjects = (user: User) => user.role === "admin" || user.role === "pm";

/** The supplier list is shared by every area, so project managers may keep it up to date. */
export async function canManageSuppliers(user: User): Promise<boolean> {
  return runsProjects(user);
}

/** The inventory: who keeps it, the inventory declares (`inventory.contract.ts`: admins and project managers). */
export async function canManageInventory(user: User): Promise<boolean> {
  return can(user, "canManageInventory");
}

/** The categories (Settings): the people who write the lines and the items with them, admins and project managers. */
export async function canKeepCategories(user: User): Promise<boolean> {
  return runsProjects(user);
}

/** The history of changes is for people who change things. */
export async function canViewHistory(user: User): Promise<boolean> {
  return runsProjects(user);
}

/** The funds of the sponsors and their contracts (CASH FROM): the admins, and the project managers with the sponsors box. */
export async function canManageFunds(user: User): Promise<boolean> {
  return user.role === "admin" || (user.role === "pm" && hasFlag(user, "sponsors"));
}

/**
 * The money of the team (the Team's fund): the register, and the BANK and the inflows of CASH FLOW:
 * the admins, and the project managers with the treasury box. The funds of the sponsors (CASH FROM)
 * are not part of it.
 */
export async function canManageCash(user: User): Promise<boolean> {
  return can(user, "canManageCash"); // the treasury declares who keeps the money of the team (treasury.contract.ts)
}

/**
 * Adding and deleting the inflows of CASH FLOW: the treasury, and the sponsors too, because some inflows are the sponsors' money.
 * Marking an inflow as received (it is tied to the register) and the BANK stay with the treasury (`canManageCash`).
 */
export async function canChangeInflows(user: User): Promise<boolean> {
  return changesInflows(user);
}

/** The admins and the sponsors may change the inflows; the bridge to the treasury adds the treasury (`treasury-budget.contract.ts`). */
const changesInflows = (user: User) => user.role === "admin" || (user.role === "pm" && hasFlag(user, "sponsors")) || can(user, "canChangeInflows");

export function requireAdmin(user: User): void {
  if (user.role !== "admin") throw forbidden("Only an admin can do this");
}

/** What the interface needs to know to show or hide commands (the server enforces them anyway). */
export function permissionsOf(user: User) {
  return {
    canEditShared: user.role === "admin" || (user.role === "pm" && hasFlag(user, "sponsors")),
    canManageCash: can(user, "canManageCash"),
    canChangeInflows: changesInflows(user),
    canManageSuppliers: runsProjects(user),
    canManageInventory: can(user, "canManageInventory"),
    canViewHistory: runsProjects(user),
    canManageUsers: user.role === "admin",
    canManageSettings: user.role === "admin",
  };
}
