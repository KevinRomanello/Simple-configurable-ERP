import { computeLines, stats, type PriceBasis, type StatsDimension } from "@erp/calc";
import { today } from "../../core/today";
import { loadSnapshot } from "../../snapshot";
import { listLocations } from "../lookups/lookups.service";
import { loadInventory } from "./inventory.data";

/** Bought, on its way, used and in stock, cut by project, area, category or location. */
export async function getStats(by: StatsDimension, basis: PriceBasis) {
  const [data, snapshot] = [await loadInventory(), await loadSnapshot()];
  const lines = computeLines(snapshot);
  const context = {
    projects: snapshot.projects.map((p) => ({ id: p.id, name: p.name, areaId: p.areaId })),
    areas: snapshot.areas.map((a) => ({ id: a.id, name: a.name })),
  };
  const labels = new Map((await listLocations()).map((l) => [l.code, l.label]));
  const rows = stats(by, data, lines, context, basis, today()).map((row) =>
    by === "location" ? { ...row, label: labels.get(row.key) ?? row.label } : row,
  );
  return { by, basis, rows };
}

/** The projects of the current season, to say which project a purchase or a use was for. */
export async function listProjects() {
  const snapshot = await loadSnapshot();
  const areas = new Map(snapshot.areas.map((a) => [a.id, a]));
  return snapshot.projects
    .map((p) => ({ id: p.id, name: p.name, areaCode: areas.get(p.areaId)?.code ?? "", areaName: areas.get(p.areaId)?.name ?? "" }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName) || a.name.localeCompare(b.name));
}
