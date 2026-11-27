import { count, eq, inArray } from "drizzle-orm";
import { contracts, type Db } from "../../core/contracts";
import { countRows, rowsOf } from "../../core/usage";
import { budgetLine, fund, lineFigures, project } from "../../db/schema/budget";
import { auditLabels, auditText, lookupRenamed, moduleInfo, permissionRules, seasonCreated, usedBy, userFlags } from "../../platform/platform.public";

// What the budget answers to the core and hears from it (docs/moduli-architettura.md, §5): who uses a category or a rate, a renamed
// category, a new season, the Sponsors box and who may change the budget's shared data, and the names the History gives its rows. It is
// read when the server starts (wiring.ts).

contracts.answer(usedBy, "budget", async (db, { kind, subjects }) => {
  const names = subjects.map((s) => s.name);
  if (kind === "category") return rowsOf(await countRows(db, budgetLine, budgetLine.category, names), subjects, "budget lines");
  if (kind === "vatRate") {
    return [
      ...rowsOf(await countRows(db, fund, fund.vatRate, names), subjects, "sponsors"),
      ...rowsOf(await countRows(db, lineFigures, lineFigures.vatRate, names), subjects, "budget lines"),
    ];
  }
  if (kind === "season") {
    const rows = await db
      .select({ seasonId: project.seasonId, n: count(budgetLine.id) })
      .from(project)
      .innerJoin(budgetLine, eq(budgetLine.projectId, project.id))
      .where(inArray(project.seasonId, subjects.map((s) => s.id!)))
      .groupBy(project.seasonId);
    return rows.map((r) => ({ key: String(r.seasonId), label: "budget lines", count: r.n }));
  }
  return [];
});

contracts.on(lookupRenamed, "budget", async (tx, { kind, from, to }) => {
  if (kind === "category") await tx.update(budgetLine).set({ category: to }).where(eq(budgetLine.category, from));
});

/** A new season has its own Team's fund and, when there is an earlier season, the same projects (empty) and the same sponsors (without money). */
contracts.on(seasonCreated, "budget", async (tx, { seasonId, fromSeasonId }) => {
  await tx.insert(fund).values({ seasonId, name: "Team's fund", kind: "team" });
  if (fromSeasonId !== null) await copyStructure(tx, fromSeasonId, seasonId);
});

/** The projects and the sponsors of a season, into a new one: no lines, no money. */
async function copyStructure(tx: Db, fromId: number, toId: number) {
  const projects = await tx.select().from(project).where(eq(project.seasonId, fromId));
  if (projects.length > 0) {
    await tx.insert(project).values(
      projects.map((p) => ({ seasonId: toId, areaId: p.areaId, name: p.name, ownerName: p.ownerName, position: p.position })),
    );
  }
  const sponsors = (await tx.select().from(fund).where(eq(fund.seasonId, fromId))).filter((f) => f.kind === "external");
  if (sponsors.length > 0) {
    await tx.insert(fund).values(
      sponsors.map((f) => ({ seasonId: toId, name: f.name, kind: f.kind, type: f.type, vatRate: f.vatRate, groupName: f.groupName, unlimited: f.unlimited })),
    );
  }
}

contracts.declare(auditLabels, "budget", {
  budget_line: (row) => auditText(row, "item"),
  line_figures: (row) => `figures (${auditText(row, "phase")}) of line ${String(row.line_id ?? "")}`,
  fund_contract: (row) => `contract of fund ${String(row.fund_id ?? "")}`,
  line_fund: (row) => `fund ${String(row.fund_id ?? "")} (no. ${String(row.position ?? "")}) of figures ${String(row.figures_id ?? "")}`,
  team_inflow: (row) => auditText(row, "source_name"),
  bank_snapshot: () => "BANK",
});

contracts.declare(userFlags, "budget", {
  key: "sponsors",
  label: "Sponsors",
  explanation: "Keeps the sponsors: their funds and contracts (CASH FROM)",
  roles: ["pm"],
});

// who may change the budget's shared data (the core's `can` asks)
const sponsorsKeeper = (user: { role: string; flags: string[] }) => user.role === "admin" || (user.role === "pm" && user.flags.includes("sponsors"));

contracts.declare(permissionRules, "budget", {
  key: "canManageFunds",
  // the sponsors and their contracts (CASH FROM): the admins and the project managers with the sponsors box
  rule: sponsorsKeeper,
});

contracts.declare(permissionRules, "budget", {
  key: "canChangeInflows",
  // adding and deleting the inflows of CASH FLOW: the sponsors too, because some inflows are their money (the bridge to the treasury adds the treasury)
  rule: sponsorsKeeper,
});

contracts.declare(permissionRules, "budget", {
  key: "canManageSuppliers",
  // the list of suppliers (BOUGHT FROM) is shared by every area: the people who run the projects keep it up to date
  rule: (user) => user.role === "admin" || user.role === "pm",
});

// how the budget presents itself: its switch in Settings › App › Modules and its addresses, /api/budget/…
contracts.declare(moduleInfo, "budget", {
  key: "budget",
  order: 10,
  label: "Budget",
  description: "The budget of the season: the lines of every area, the sponsors and their funds (CASH FROM), the suppliers, CASH FLOW, the Gantt, TOTAL and the analyses.",
});
