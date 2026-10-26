import { db, pool } from "@erp/api/db";
import { fromCents, fromScaled } from "@erp/api/money";
import {
  area, bankSnapshot, budgetLine, fund, fundContract, lineFigures, lineFund, project, supplier, teamInflow,
} from "@erp/api/schema";
import { getCurrentSeason } from "@erp/api/seasons";
import { loadLookups } from "@erp/api/lookups";
import { and, eq, inArray, sql } from "drizzle-orm";
import { openWorkbook, readInputs } from "./read-inputs";
import { toSnapshot } from "./to-snapshot";

// Loads the workbook into the database of the current season. Development tool: it needs the
// base data (`pnpm db:seed`) and refuses to touch a database that already has projects unless
// called with --replace, which wipes the season's budget data and the supplier list first.

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const path = args.find((a) => !a.startsWith("--")) ?? "../../fonti/Budget 26-27.xlsx";

const { snapshot, warnings } = toSnapshot(readInputs(await openWorkbook(path)), await loadLookups());
for (const w of warnings) console.warn(`warning: ${w}`);

const season = await getCurrentSeason();
const areaIds = new Map((await db.select().from(area)).map((a) => [a.code, a.id]));

await db.transaction(async (tx) => {
  const [existing] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(project)
    .where(eq(project.seasonId, season.id));
  const count = existing?.count ?? 0;
  if (count > 0 && !replace) {
    throw new Error(`The season already has ${count} projects. Use --replace to wipe and reload.`);
  }

  // Wipe, children first (lines and their figures go with the projects).
  await tx.delete(project).where(eq(project.seasonId, season.id));
  const seasonFunds = tx.select({ id: fund.id }).from(fund).where(eq(fund.seasonId, season.id));
  await tx.delete(fundContract).where(inArray(fundContract.fundId, seasonFunds));
  await tx.delete(teamInflow).where(eq(teamInflow.seasonId, season.id));
  await tx.delete(bankSnapshot).where(eq(bankSnapshot.seasonId, season.id));
  await tx.delete(fund).where(and(eq(fund.seasonId, season.id), eq(fund.kind, "external")));
  await tx.delete(supplier);

  // Funds: the team fund already exists; the snapshot's ids map to database ids.
  const [team] = await tx.select().from(fund).where(and(eq(fund.seasonId, season.id), eq(fund.kind, "team")));
  const fundIds = new Map<number, number>();
  for (const f of snapshot.funds) {
    if (f.kind === "team") {
      fundIds.set(f.id, team!.id);
      continue;
    }
    const [row] = await tx
      .insert(fund)
      .values({
        seasonId: season.id,
        name: f.name,
        kind: "external",
        type: f.type,
        vatRate: f.vatRate === null ? null : f.vatRate.toFixed(2),
        groupName: f.group,
      })
      .returning({ id: fund.id });
    fundIds.set(f.id, row!.id);
  }

  const supplierIds = new Map<number, number>();
  for (const s of snapshot.suppliers) {
    const [row] = await tx.insert(supplier).values({ name: s.name }).returning({ id: supplier.id });
    supplierIds.set(s.id, row!.id);
  }

  const projectIds = new Map<number, number>();
  for (const p of snapshot.projects) {
    const code = snapshot.areas.find((a) => a.id === p.areaId)!.code;
    const [row] = await tx
      .insert(project)
      .values({
        seasonId: season.id,
        areaId: areaIds.get(code)!,
        name: p.name,
        ownerName: p.ownerName,
        position: p.position,
      })
      .returning({ id: project.id });
    projectIds.set(p.id, row!.id);
  }

  for (const line of snapshot.lines) {
    const [row] = await tx
      .insert(budgetLine)
      .values({
        projectId: projectIds.get(line.projectId)!,
        position: line.position,
        item: line.item,
        category: line.category,
        priority: line.priority,
        note: line.note,
      })
      .returning({ id: budgetLine.id });
    for (const phase of ["estimate", "actual"] as const) {
      const f = line.figures[phase];
      if (!f) continue;
      const [saved] = await tx.insert(lineFigures).values({
        lineId: row!.id,
        phase,
        quantity: fromScaled(f.quantityMilli, 3),
        unitNetCost: fromScaled(f.unitCostE4, 4),
        sponsorType: f.sponsorType,
        sponsorValue: f.sponsorValueCents === null ? null : fromCents(f.sponsorValueCents),
        vatRate: f.vatRate === null ? null : f.vatRate.toFixed(2),
        supplierId: f.supplierId === null ? null : supplierIds.get(f.supplierId)!,
        purchaseDate: f.purchaseDate,
        arrivalDate: f.arrivalDate,
      }).returning({ id: lineFigures.id });
      for (const [index, snapshotFundId] of f.fundIds.entries()) {
        await tx.insert(lineFund).values({ figuresId: saved!.id, position: index + 1, fundId: fundIds.get(snapshotFundId)! });
      }
    }
  }

  for (const c of snapshot.contracts) {
    await tx.insert(fundContract).values({
      fundId: fundIds.get(c.fundId)!,
      phase: c.phase,
      amount: fromCents(c.amountCents),
      inflowDate: c.inflowDate,
    });
  }
  for (const i of snapshot.inflows) {
    await tx.insert(teamInflow).values({
      seasonId: season.id,
      phase: i.phase,
      sourceName: i.sourceName,
      amount: fromCents(i.amountCents),
      inflowDate: i.inflowDate,
    });
  }
  if (snapshot.bank) {
    await tx.insert(bankSnapshot).values({
      seasonId: season.id,
      amount: fromCents(snapshot.bank.amountCents),
      asOfDate: snapshot.bank.asOfDate,
    });
  }
});

await pool.end();
console.log(
  `Loaded ${snapshot.projects.length} projects, ${snapshot.lines.length} lines, ` +
    `${snapshot.funds.length - 1} funds, ${snapshot.suppliers.length} suppliers.`,
);
