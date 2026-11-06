import { asc, desc, eq, sql } from "drizzle-orm";
import { conflict, notFound } from "../../core/errors";
import { today } from "../../core/today";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { budgetLine, fund, project, season } from "../../db/schema";
import { getCurrentUser, requireAdmin } from "../auth/auth.service";
import { seasonStorage } from "./seasons.context";

// Seasons and their cars: one budget per season, chosen in the menu (docs/stagioni-anni-fiscali-e-macchine.md).

type Season = typeof season.$inferSelect;
type Reader = Pick<Tx, "select">;

/** The season of today: the last one that has already started (the first one, if none has yet). */
function seasonOfToday(seasons: Season[]): Season {
  const now = today();
  const started = seasons.filter((s) => s.startsOn <= now);
  const found = started.at(-1) ?? seasons[0];
  if (!found) throw new Error("Current season not found: run `pnpm db:seed`");
  return found;
}

/** Every season, the oldest first. */
export async function allSeasons(reader: Reader = db): Promise<Season[]> {
  return reader.select().from(season).orderBy(asc(season.startsOn));
}

/**
 * The season every request works on (GET /api/seasons/current): the one chosen in the menu, or
 * the season of today when nothing is chosen (and outside a request: the importer, the seed).
 */
export async function getCurrentSeason(): Promise<Season> {
  const chosen = seasonStorage.getStore();
  return chosen == null ? seasonOfToday(await allSeasons()) : getSeasonById(chosen);
}

/** A season by its id (the TOTAL pages choose one on their own, whatever the menu says). */
export async function getSeasonById(seasonId: number): Promise<Season> {
  const [found] = await db.select().from(season).where(eq(season.id, seasonId));
  if (!found) throw notFound("Season");
  return found;
}

/** A season by its name, "2025-2026" (the importer loads a sheet into it). */
export async function getSeasonByName(name: string): Promise<Season> {
  const [found] = await db.select().from(season).where(eq(season.name, name));
  if (!found) throw notFound(`Season "${name}"`);
  return found;
}

/** Every season, the latest first, with its car, how many budget lines it has and which one is today's (GET /api/seasons). */
export async function listSeasons() {
  const seasons = await allSeasons();
  const current = seasons.length > 0 ? seasonOfToday(seasons).id : null;
  const counts = await db
    .select({ seasonId: project.seasonId, lines: sql<number>`count(${budgetLine.id})::int` })
    .from(project)
    .innerJoin(budgetLine, eq(budgetLine.projectId, project.id))
    .groupBy(project.seasonId);
  const lines = new Map(counts.map((c) => [c.seasonId, c.lines]));
  return seasons.reverse().map((s) => ({ ...s, current: s.id === current, lines: lines.get(s.id) ?? 0 }));
}

/** The name and the days of the season that starts in September of `startYear`. */
export function seasonDates(startYear: number) {
  // HARDCODED: the season runs from 1 September to 31 August; a setting if the team ever changes it
  return { name: `${startYear}-${startYear + 1}`, startsOn: `${startYear}-09-01`, endsOn: `${startYear + 1}-08-31` };
}

/**
 * Adds a season (POST /api/seasons, admin). It starts from the latest one, for convenience: the same
 * projects (empty) and the same sponsors (without their money), and its own Team's fund.
 */
export async function createSeason(input: { startYear: number; car: string }) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const dates = seasonDates(input.startYear);
  return runWrite(actor, async (tx) => {
    const [latest] = await tx.select().from(season).orderBy(desc(season.startsOn)).limit(1);
    const [taken] = await tx.select({ id: season.id }).from(season).where(eq(season.name, dates.name));
    if (taken) throw conflict(`The season ${dates.name} already exists`);

    const [created] = await tx.insert(season).values({ ...dates, car: input.car }).returning();
    await tx.insert(fund).values({ seasonId: created!.id, name: "Team's fund", kind: "team" });
    if (latest) await copyStructure(tx, latest.id, created!.id);
    return created!;
  });
}

/** The projects and the sponsors of a season, into a new one: no lines, no money. */
async function copyStructure(tx: Tx, fromId: number, toId: number) {
  const projects = await tx.select().from(project).where(eq(project.seasonId, fromId));
  if (projects.length > 0) {
    await tx.insert(project).values(
      projects.map((p) => ({ seasonId: toId, areaId: p.areaId, name: p.name, ownerName: p.ownerName, position: p.position })),
    );
  }
  const sponsors = (await tx.select().from(fund).where(eq(fund.seasonId, fromId))).filter((f) => f.kind === "external");
  if (sponsors.length > 0) {
    await tx.insert(fund).values(
      sponsors.map((f) => ({ seasonId: toId, name: f.name, kind: f.kind, type: f.type, vatRate: f.vatRate, groupName: f.groupName })),
    );
  }
}

/** Renames the car of a season or locks it (PATCH /api/seasons/:id, admin). */
export async function updateSeason(seasonId: number, input: { car?: string; readOnly?: boolean }) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  return runWrite(actor, async (tx) => {
    const [updated] = await tx.update(season).set(input).where(eq(season.id, seasonId)).returning();
    if (!updated) throw notFound("Season");
    return updated;
  });
}

/** Refuses a change to the budget of a read-only season. Called by every write of a budget. */
export async function assertSeasonOpen(reader: Reader, seasonId: number) {
  const [found] = await reader.select({ name: season.name, readOnly: season.readOnly }).from(season).where(eq(season.id, seasonId));
  if (found?.readOnly) throw conflict(`The season ${found.name} is read-only: an admin can open it again in Settings`);
}

/** Checks that a car chosen for a line or an arrival exists: a car is the season it belongs to. */
export async function assertCarExists(reader: Reader, carSeasonId: number | null | undefined) {
  if (carSeasonId == null) return;
  const [found] = await reader.select({ id: season.id }).from(season).where(eq(season.id, carSeasonId));
  if (!found) throw conflict(`Car ${carSeasonId} does not exist`);
}
