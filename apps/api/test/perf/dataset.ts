import { and, eq, sql } from "drizzle-orm";
import { ownerDb } from "../../src/db/owner";
import {
  area, auditLog, budgetLine, cashCategory, cashEntry, cashEntryLine, cashMethod, cashOpening, componentPart, fund, fundContract, inventoryItem, lineFigures, lineFund,
  location, project, season, stockMovement, supplier, teamInflow,
} from "../../src/db/schema";

// A made-up season of a size to measure, the same every time (a fixed seed), so that two runs of the benchmark read the same data and the
// answers of the API can be compared with the ones of an earlier run. Nothing here is real: names and money are invented.
// It is written straight into the tables, without the History (the session turns the audit triggers off), as a seed does.

/** A small generator of numbers that is always the same for the same seed (mulberry32). */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chunks = <T>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
const money = (cents: number) => (cents / 100).toFixed(2);
/** `YYYY-MM-DD` of a day of the season (September 1st is day 0), in 2026-2027. */
const seasonDay = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * 86_400_000).toISOString().slice(0, 10);

export interface Size {
  lines: number;
  /** The movements of the register of the team's money. */
  entries: number;
  items: number;
}

/** What the benchmark measures: about a thousand lines is what a season of the team is expected to be; five times that is the stress. */
export const SIZES: Record<string, Size> = {
  real: { lines: 1000, entries: 2500, items: 500 },
  stress: { lines: 5000, entries: 12500, items: 2500 },
};

/** Fills the empty database (the seed season, the areas, the team fund and the lists already there) with a season of the given size. */
export async function buildSeason(size: Size) {
  const rand = random(2026);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const between = (low: number, high: number) => low + Math.floor(rand() * (high - low + 1));

  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    const [current] = await tx.select().from(season).where(eq(season.name, "2026-2027"));
    const areas = await tx.select().from(area).where(eq(area.derived, false));
    const [team] = await tx.select().from(fund).where(and(eq(fund.seasonId, current!.id), eq(fund.kind, "team")));
    const categories = await tx.select().from(cashCategory);
    const methods = await tx.select().from(cashMethod);
    const places = await tx.select().from(location);

    const suppliers = await tx.insert(supplier).values(Array.from({ length: 60 }, (_, i) => ({ name: `Supplier ${i + 1}` }))).returning();
    const sponsors = await tx
      .insert(fund)
      .values(Array.from({ length: 25 }, (_, i) => ({ seasonId: current!.id, name: `Sponsor ${i + 1}`, kind: "external" as const, type: "fund" as const, vatRate: pick(["0", "10", "22"]), groupName: i % 5 === 0 ? `Group ${i % 3}` : null })))
      .returning();
    await tx.insert(fundContract).values(sponsors.flatMap((f, i) => (["estimate", "actual"] as const).map((phase) => ({ fundId: f.id, phase, amount: money(between(1000, 20000) * 100), inflowDate: seasonDay(20 + i * 8) }))));

    // the projects: a dozen lines each, spread over the areas
    const projects = await tx
      .insert(project)
      .values(Array.from({ length: Math.ceil(size.lines / 12) }, (_, i) => ({ seasonId: current!.id, areaId: areas[i % areas.length]!.id, name: `Project ${i + 1}`, ownerName: `Owner ${i % 9}`, position: Math.floor(i / areas.length) + 1 })))
      .returning();
    const lines: (typeof budgetLine.$inferSelect)[] = [];
    for (const part of chunks(Array.from({ length: size.lines }, (_, i) => i), 1000)) {
      const made = await tx
        .insert(budgetLine)
        .values(part.map((i) => ({ projectId: projects[i % projects.length]!.id, position: Math.floor(i / projects.length) + 1, item: `Item ${i + 1}`, brand: i % 3 === 0 ? `Brand ${i % 17}` : null, model: i % 3 === 0 ? `M${i % 101}` : null, category: pick(["Components", "Consumable", "Tools", "Services"]), priority: pick(["High", "Medium", "Low"]) })))
        .returning();
      lines.push(...made);
    }

    // the figures of each line in the two phases, and who pays them
    const figures: (typeof lineFigures.$inferInsert)[] = [];
    for (const line of lines) {
      const type = pick(["none", "none", "none", "partial", "total"] as const);
      const unit = between(100, 50_000);
      for (const phase of ["estimate", "actual"] as const) {
        if (phase === "actual" && rand() < 0.3) continue;
        const day = between(0, 330);
        figures.push({
          lineId: line.id, phase, quantity: String(between(1, 40)), unitNetCost: money(unit), sponsorType: type,
          sponsorValue: type === "partial" ? money(between(100, 2000)) : null, vatRate: pick(["0", "10", "22"]),
          supplierId: pick(suppliers).id, purchaseDate: seasonDay(day), arrivalDate: phase === "actual" && rand() < 0.5 ? seasonDay(day + between(3, 30)) : null,
        });
      }
    }
    const figureRows: (typeof lineFigures.$inferSelect)[] = [];
    for (const part of chunks(figures, 1500)) figureRows.push(...(await tx.insert(lineFigures).values(part).returning()));
    const payers = figureRows.flatMap((f) => {
      const sponsor = pick(sponsors);
      return f.sponsorType === "none" ? [{ figuresId: f.id, position: 1, fundId: team!.id }] : f.sponsorType === "total" ? [{ figuresId: f.id, position: 1, fundId: sponsor.id }] : [{ figuresId: f.id, position: 1, fundId: sponsor.id }, { figuresId: f.id, position: 2, fundId: team!.id }];
    });
    for (const part of chunks(payers, 3000)) await tx.insert(lineFund).values(part);

    // the money that comes in: some expected, some actual, in the cash flow
    await tx.insert(teamInflow).values(Array.from({ length: 60 }, (_, i) => ({ seasonId: current!.id, phase: i % 3 === 0 ? ("actual" as const) : ("estimate" as const), sourceName: `Company ${i + 1}`, amount: money(between(500, 15_000) * 100), inflowDate: seasonDay(between(0, 330)), sponsorship: i % 4 !== 0 })));

    // the register: a balance to start from (so the BANK is the register's) and the movements, some of them paying lines
    await tx.insert(cashOpening).values((["cash", "bank", "paypal"] as const).map((account) => ({ year: 2026, account, amount: money(between(1000, 9000) * 100) })));
    const entries: (typeof cashEntry.$inferSelect)[] = [];
    for (const part of chunks(Array.from({ length: size.entries }, (_, i) => i), 2500)) {
      const made = await tx
        .insert(cashEntry)
        .values(part.map((i) => ({ entryOn: seasonDay(between(-120, 360)), description: `Movement ${i + 1}`, categoryId: pick(categories).id, methodId: pick(methods).id, account: pick(["cash", "bank", "paypal"] as const), amount: money((rand() < 0.35 ? 1 : -1) * between(500, 300_000)), sponsorship: false })))
        .returning();
      entries.push(...made);
    }
    const payments = entries.filter((e) => Number(e.amount) < 0 && rand() < 0.4).map((e, i) => ({ entryId: e.id, lineId: lines[(i * 7) % lines.length]!.id, amount: money(Math.min(Math.abs(Number(e.amount)) * 100, between(200, 20_000))) }));
    for (const part of chunks(payments, 3000)) await tx.insert(cashEntryLine).values(part).onConflictDoNothing();

    // the inventory: items, what arrived (some of it for lines of the budget) and what was used
    const items: (typeof inventoryItem.$inferSelect)[] = [];
    for (const part of chunks(Array.from({ length: size.items }, (_, i) => i), 1000)) {
      items.push(...(await tx.insert(inventoryItem).values(part.map((i) => ({ code: `B-${i + 1}`, name: `Part ${i + 1}`, brand: i % 4 === 0 ? `Brand ${i % 13}` : null, category: pick(["Components", "Consumable", "Tools"]), unit: "pcs", origin: i % 20 === 0 ? ("made" as const) : ("bought" as const) }))).returning()));
    }
    // what the team makes is made of a few of the parts
    const bought = items.filter((item) => item.origin === "bought");
    await tx.insert(componentPart).values(items.filter((item) => item.origin === "made").flatMap((item, i) => Array.from({ length: 5 }, (_, k) => ({ componentId: item.id, partId: bought[(i * 5 + k) % bought.length]!.id, quantity: String(between(1, 6)) }))));
    const moves: (typeof stockMovement.$inferInsert)[] = items.flatMap((item, i) => {
      const net = between(50, 5000);
      const receipt = { itemId: item.id, kind: "receipt" as const, occurredOn: seasonDay(between(0, 100)), quantity: String(between(5, 200)), location: pick(places).code, unitNet: money(net), unitGross: money(Math.round(net * 1.22)), unitTeam: money(Math.round(net * 1.22)), budgetLineId: i % 2 === 0 ? lines[i % lines.length]!.id : null, projectId: i % 2 === 0 ? projects[i % projects.length]!.id : null };
      return rand() < 0.6 ? [receipt, { itemId: item.id, kind: "use" as const, occurredOn: seasonDay(between(101, 200)), quantity: String(between(1, 4)), location: receipt.location, projectId: pick(projects).id }] : [receipt];
    });
    for (const part of chunks(moves, 1500)) await tx.insert(stockMovement).values(part);

    // the History grows with every change: the pages of the History read a long table
    const changed = [
      (n: number) => ["budget_line", { item: `Item ${n}`, category: "Components" }] as const,
      (n: number) => ["cash_entry", { description: `Movement ${n}`, amount: "10.00" }] as const,
      (n: number) => ["inventory_item", { name: `Part ${n}` }] as const,
      (n: number) => ["stock_movement", { kind: "use", item_id: n }] as const,
      (n: number) => ["line_figures", { phase: "actual", line_id: n }] as const,
      (n: number) => ["team_inflow", { source_name: `Company ${n}` }] as const,
      (n: number) => ["fund_contract", { fund_id: n }] as const,
    ];
    const history = Array.from({ length: size.lines * 4 }, (_, i) => {
      const [tableName, after] = changed[i % changed.length]!(i + 1);
      // the time is fixed too: what the History says of when must not depend on when the benchmark runs
      return { at: new Date(Date.UTC(2026, 9, 1) + i * 60_000), tableName, rowId: i + 1, action: i % 5 === 0 ? "insert" : "update", actorId: null, before: i % 5 === 0 ? null : { ...after, note: "before" }, after };
    });
    for (const part of chunks(history, 3000)) await tx.insert(auditLog).values(part);
  });
}
