import { eq } from "drizzle-orm";
import type { db as Db } from "./client";
import { area, fund, season } from "./schema";

// Reference data every installation needs. Idempotent: running it twice changes nothing.
const AREAS = [
  { code: "mt-dmt", name: "MT + DMT", derived: false },
  { code: "sw", name: "SW", derived: false },
  { code: "hw", name: "HW", derived: false },
  { code: "cm", name: "CM", derived: false },
  { code: "mgt", name: "MGT", derived: false },
  { code: "rt", name: "RT", derived: false },
  // what the team spends and receives outside the budget (a stamp duty, a fee), calculated from the register: read-only, last
  { code: "administration", name: "ADMINISTRATION", derived: true },
];

export async function seedBase(db: typeof Db) {
  await db
    .insert(season)
    .values({ name: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-08-31", car: "Car 2026-2027" })
    .onConflictDoNothing();
  const [current] = await db.select().from(season).where(eq(season.name, "2026-2027"));

  await db
    .insert(area)
    .values(AREAS.map((a, index) => ({ ...a, position: index + 1 })))
    .onConflictDoNothing();

  // "Team's fund" always exists and is the only fund of kind `team` in the season.
  await db
    .insert(fund)
    .values({ seasonId: current!.id, name: "Team's fund", kind: "team" })
    .onConflictDoNothing();
}
