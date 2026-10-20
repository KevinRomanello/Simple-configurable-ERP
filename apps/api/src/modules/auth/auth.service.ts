export type Role = "admin" | "area_head" | "read_only";

export interface User {
  email: string;
  name: string;
  role: Role;
}

/** Who is making the request (GET /api/me). */
export async function getCurrentUser(): Promise<User> {
  // HARDCODED: becomes the signed-in Google user (OIDC), restricted to the team's domain
  return { email: "admin@local", name: "Local admin", role: "admin" };
}

/**
 * Whether `user` may change the data of an area (`areaId`) or the data shared by all areas
 * (`areaId` null: funds, suppliers, inflows, BANK). Called before every write.
 */
export async function canWrite(user: User, areaId: number | null): Promise<boolean> {
  // HARDCODED: becomes role based: admins everywhere, area heads only in their own areas and never
  // on shared data
  return true;
}
