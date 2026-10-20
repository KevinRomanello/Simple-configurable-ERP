import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { season } from "../../db/schema";

/** The season every request works on (GET /api/seasons/current). */
export async function getCurrentSeason() {
  // HARDCODED: becomes the selected season once more than one can exist
  const [current] = await db.select().from(season).where(eq(season.name, "2026-2027"));
  if (!current) throw new Error("Current season not found: run `pnpm db:seed`");
  return current;
}
