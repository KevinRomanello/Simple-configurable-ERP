import { stats, type PriceBasis, type StatsDimension } from "@erp/calc";
import { eq } from "drizzle-orm";
import { contracts } from "../../core/contracts";
import { today } from "../../core/today";
import { db } from "../../db/client";
import { stockMovement } from "../../db/schema/inventory";
import { season } from "../../db/schema/platform";
import { currentActive } from "../../platform/platform.public";
import { getCurrentSeason } from "../../platform/seasons/seasons.service";
import { loadInventory } from "./inventory.data";
import { lineCarsOfReceipts, statsBudget } from "./inventory.ports";
import { listLocations } from "./lists.service";

/**
 * The season whose car each receipt is for: chosen on an arrival from outside the budget, or the car of the purchase of the budget it
 * completes (the bridge says it: the car chosen on the line, else the line's season), or else the season of its date.
 */
async function receiptCars(): Promise<Map<number, number | null>> {
  const receipts = await db.select({ id: stockMovement.id, carSeasonId: stockMovement.carSeasonId, on: stockMovement.occurredOn }).from(stockMovement).where(eq(stockMovement.kind, "receipt"));
  const seasons = await db.select({ id: season.id, startsOn: season.startsOn, endsOn: season.endsOn }).from(season);
  const unchosen = receipts.filter((r) => r.carSeasonId === null).map((r) => r.id);
  const ofLine = new Map((unchosen.length === 0 ? [] : await contracts.ask(lineCarsOfReceipts, currentActive(), db, { movementIds: unchosen })).map((r) => [r.movementId, r.seasonId]));
  const ofDay = (on: string) => seasons.find((s) => s.startsOn <= on && on <= s.endsOn)?.id ?? null;
  return new Map(receipts.map((r) => [r.id, r.carSeasonId ?? ofLine.get(r.id) ?? ofDay(r.on)]));
}

/**
 * Bought, on its way, used and in stock in the season chosen in the menu (what was bought and used in its days; the stock is today's), cut
 * by project, area, category, location or car. What was bought and is on its way, and the projects and areas, come from the budget through
 * the bridge: without it, the cuts by project and area say «no project» and nothing is on its way.
 */
export async function getStats(by: StatsDimension, basis: PriceBasis) {
  const current = await getCurrentSeason();
  const [data, budget] = [await loadInventory(), await contracts.ask(statsBudget, currentActive(), db, { season: current })];
  const context = {
    projects: budget.projects,
    areas: budget.areas.map((a) => ({ id: a.id, name: a.name })),
    period: { from: current.startsOn, to: current.endsOn },
    cars: by === "car" ? { seasons: await db.select({ id: season.id, car: season.car }).from(season), seasonId: current.id, receipts: await receiptCars() } : undefined,
  };
  const labels = new Map((await listLocations()).map((l) => [l.code, l.label]));
  const rows = stats(by, data, budget.lines, context, basis, today()).map((row) =>
    by === "location" ? { ...row, label: labels.get(row.key) ?? row.label } : row,
  );
  return { by, basis, season: { name: current.name, from: current.startsOn, to: current.endsOn }, rows };
}
