import { asc } from "drizzle-orm";
import { db } from "../../db/client";
import { area } from "../../db/schema";

/** The areas, in the order of the old sheet tabs (GET /api/areas). They are the core's: users, projects, items and types all point at one. */
export async function listAreas() {
  return db.select().from(area).orderBy(asc(area.position));
}
