import type { Figures, Phase, Snapshot } from "@erp/calc";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { toCents, toScaled } from "./core/money";
import { db } from "./db/client";
import {
  area, bankSnapshot, budgetLine, fund, fundContract, lineFigures, lineFund, project, stockMovement, supplier, teamInflow,
} from "./db/schema";
import { loadLookups } from "./modules/lookups/lookups.service";
import { getCurrentSeason } from "./modules/seasons/seasons.service";

type FigureRow = typeof lineFigures.$inferSelect;

function figuresOf(row: FigureRow, fundIds: number[]): Figures {
  return {
    quantityMilli: toScaled(row.quantity, 3),
    unitCostE4: toScaled(row.unitNetCost, 4),
    sponsorType: row.sponsorType,
    sponsorValueCents: row.sponsorValue === null ? null : toCents(row.sponsorValue),
    vatRate: row.vatRate === null ? null : Number(row.vatRate),
    fundIds,
    supplierId: row.supplierId,
    purchaseDate: row.purchaseDate,
    arrivalDate: row.arrivalDate,
  };
}

/**
 * Everything the calculation engine needs, read from the database of the current season.
 * One read-only transaction, so a write that commits halfway cannot produce a snapshot where
 * the tables disagree with each other.
 */
export async function loadSnapshot(): Promise<Snapshot> {
  const season = await getCurrentSeason();
  const lookups = await loadLookups();

  return db.transaction(
    async (tx) => {
      const inSeason = eq(project.seasonId, season.id);
      const areas = await tx.select().from(area).orderBy(asc(area.position));
      const projects = await tx.select().from(project).where(inSeason);
      const lines = await tx
        .select({ line: budgetLine })
        .from(budgetLine)
        .innerJoin(project, eq(budgetLine.projectId, project.id))
        .where(inSeason);
      const figures = await tx
        .select({ figures: lineFigures })
        .from(lineFigures)
        .innerJoin(budgetLine, eq(lineFigures.lineId, budgetLine.id))
        .innerJoin(project, eq(budgetLine.projectId, project.id))
        .where(inSeason);
      const lineFunds = await tx
        .select({ figuresId: lineFund.figuresId, fundId: lineFund.fundId })
        .from(lineFund)
        .innerJoin(lineFigures, eq(lineFund.figuresId, lineFigures.id))
        .innerJoin(budgetLine, eq(lineFigures.lineId, budgetLine.id))
        .innerJoin(project, eq(budgetLine.projectId, project.id))
        .where(inSeason)
        .orderBy(asc(lineFund.position));
      const funds = await tx.select().from(fund).where(eq(fund.seasonId, season.id));
      const contracts = await tx
        .select({ contract: fundContract })
        .from(fundContract)
        .innerJoin(fund, eq(fundContract.fundId, fund.id))
        .where(eq(fund.seasonId, season.id));
      const inflows = await tx.select().from(teamInflow).where(eq(teamInflow.seasonId, season.id));
      const suppliers = await tx.select().from(supplier);
      const [bank] = await tx.select().from(bankSnapshot).where(eq(bankSnapshot.seasonId, season.id));
      const arrived = await tx
        .select({ lineId: stockMovement.budgetLineId, quantity: sql<string>`sum(${stockMovement.quantity})` })
        .from(stockMovement)
        .where(and(eq(stockMovement.kind, "receipt"), isNotNull(stockMovement.budgetLineId)))
        .groupBy(stockMovement.budgetLineId);

      const fundIdsByFigures = new Map<number, number[]>();
      for (const { figuresId, fundId } of lineFunds) {
        fundIdsByFigures.set(figuresId, [...(fundIdsByFigures.get(figuresId) ?? []), fundId]);
      }

      const figuresByLine = new Map<number, Record<Phase, Figures | null>>();
      for (const { figures: row } of figures) {
        const entry = figuresByLine.get(row.lineId) ?? { estimate: null, actual: null };
        entry[row.phase] = figuresOf(row, fundIdsByFigures.get(row.id) ?? []);
        figuresByLine.set(row.lineId, entry);
      }

      return {
        lookups,
        areas: areas.map((a) => ({ id: a.id, code: a.code, name: a.name, position: a.position })),
        projects: projects.map((p) => ({
          id: p.id, areaId: p.areaId, name: p.name, ownerName: p.ownerName, position: p.position,
        })),
        lines: lines.map(({ line }) => ({
          id: line.id,
          projectId: line.projectId,
          position: line.position,
          item: line.item,
          category: line.category,
          priority: line.priority,
          note: line.note,
          version: line.version,
          figures: figuresByLine.get(line.id) ?? { estimate: null, actual: null },
        })),
        funds: funds.map((f) => ({
          id: f.id,
          name: f.name,
          kind: f.kind,
          paysVat: f.paysVat,
          mode: f.mode,
          type: f.type,
          vatRate: f.vatRate === null ? null : Number(f.vatRate),
          group: f.groupName,
        })),
        contracts: contracts.map(({ contract: c }) => ({
          id: c.id, fundId: c.fundId, phase: c.phase, amountCents: toCents(c.amount), inflowDate: c.inflowDate,
        })),
        inflows: inflows.map((i) => ({
          id: i.id, phase: i.phase, sourceName: i.sourceName, amountCents: toCents(i.amount), inflowDate: i.inflowDate,
        })),
        suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
        receipts: arrived.map((r) => ({ lineId: r.lineId!, quantityMilli: toScaled(r.quantity, 3) })),
        bank: bank ? { amountCents: toCents(bank.amount), asOfDate: bank.asOfDate } : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
