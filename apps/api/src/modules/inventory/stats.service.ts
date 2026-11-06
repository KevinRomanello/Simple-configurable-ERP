import { computeLines, stats, type PriceBasis, type StatsDimension } from "@erp/calc";
import { eq, sql } from "drizzle-orm";
import { today } from "../../core/today";
import { db } from "../../db/client";
import { budgetLine, project, season, stockMovement } from "../../db/schema";
import { loadSnapshot } from "../../snapshot";
import { listLocations } from "../lookups/lookups.service";
import { getCurrentSeason } from "../seasons/seasons.service";
import { loadInventory } from "./inventory.data";

/**
 * The season whose car each receipt is for: chosen on an arrival from outside the budget, or the car
 * of its line (chosen on the line, else the line's season), or else the season of its date.
 */
async function receiptCars(): Promise<Map<number, number | null>> {
  const rows = await db
    .select({
      id: stockMovement.id,
      car: sql<number | null>`coalesce(${stockMovement.carSeasonId}, ${budgetLine.carSeasonId}, ${project.seasonId}, ${season.id})`,
    })
    .from(stockMovement)
    .leftJoin(budgetLine, eq(budgetLine.id, stockMovement.budgetLineId))
    .leftJoin(project, eq(project.id, budgetLine.projectId))
    .leftJoin(season, sql`${stockMovement.occurredOn} between ${season.startsOn} and ${season.endsOn}`)
    .where(eq(stockMovement.kind, "receipt"));
  return new Map(rows.map((r) => [r.id, r.car]));
}

/**
 * Bought, on its way, used and in stock in the season chosen in the menu (what was bought and used in
 * its days; the stock is today's), cut by project, area, category, location or car.
 */
export async function getStats(by: StatsDimension, basis: PriceBasis) {
  const current = await getCurrentSeason();
  const [data, snapshot] = [await loadInventory(), await loadSnapshot(current)];
  const lines = computeLines(snapshot);
  const context = {
    projects: snapshot.projects.map((p) => ({ id: p.id, name: p.name, areaId: p.areaId })),
    areas: snapshot.areas.map((a) => ({ id: a.id, name: a.name })),
    period: { from: current.startsOn, to: current.endsOn },
    cars: by === "car" ? { seasons: await db.select({ id: season.id, car: season.car }).from(season), seasonId: current.id, receipts: await receiptCars() } : undefined,
  };
  const labels = new Map((await listLocations()).map((l) => [l.code, l.label]));
  const rows = stats(by, data, lines, context, basis, today()).map((row) =>
    by === "location" ? { ...row, label: labels.get(row.key) ?? row.label } : row,
  );
  return { by, basis, season: { name: current.name, from: current.startsOn, to: current.endsOn }, rows };
}

/** The projects of the season chosen in the menu, to say which project a purchase or a use was for. */
export async function listProjects() {
  const snapshot = await loadSnapshot();
  const areas = new Map(snapshot.areas.map((a) => [a.id, a]));
  return snapshot.projects
    .map((p) => ({ id: p.id, name: p.name, areaCode: areas.get(p.areaId)?.code ?? "", areaName: areas.get(p.areaId)?.name ?? "" }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName) || a.name.localeCompare(b.name));
}
