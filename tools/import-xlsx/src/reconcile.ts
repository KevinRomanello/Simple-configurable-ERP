import {
  analysisByFund, analysisBySupplier, cashFlowSummary, computeLines, fundSummary, gantt, itemsView,
  totals, vatReport, type Analysis, type Phase, type Snapshot,
} from "@erp/calc";
import { loadLookups } from "@erp/api/lookups";
import { loadSnapshot } from "@erp/api/snapshot";
import {
  cashFlowFigures, fundBalances, lineOracle, readAnalysis, readCategoryAnalysis, readGantt,
  totalCells, vatReportDeadlines, vatReportRow, type GanttOracle,
} from "./read-oracle";
import { AREA_SHEETS, openWorkbook, readInputs, sheetOf } from "./read-inputs";
import { Report } from "./report";
import { slug, toSnapshot } from "./to-snapshot";

// Imports the real workbook in memory, runs the engine on it and compares the result with the
// values the Google Sheet had saved. A difference is either an engine bug or a quirk of the
// sheet: both are worth knowing before building any screen on top.
//
// With --db the engine is fed from the database (after `load`) instead of from the workbook:
// the same checks then also prove that the schema, the loader and loadSnapshot lose nothing.
//
// Tolerance: the sheet never rounds, the engine rounds VAT to the cent on every line, so each
// line may differ by up to ~0.012 EUR and a total by that much per contributing line.

const args = process.argv.slice(2);
const fromDb = args.includes("--db");
const path = args.find((a) => !a.startsWith("--")) ?? "../../fonti/Budget 26-27.xlsx";
const workbook = await openWorkbook(path);
const raw = readInputs(workbook);
const lookups = await loadLookups();
const converted = toSnapshot(raw, lookups);
const warnings = converted.warnings;
const snapshot: Snapshot = fromDb ? await loadSnapshot() : converted.snapshot;
console.log(`Engine input: ${fromDb ? "database" : "workbook"}\n`);
const report = new Report();
const phases: Phase[] = ["estimate", "actual"];
const lines = computeLines(snapshot);
const perLine = 0.012;
const tolerance = (lineCount: number) => perLine * Math.max(1, lineCount);
const countIn = (predicate: (l: (typeof lines)[number]) => boolean) => lines.filter(predicate).length;

for (const w of warnings) report.skip("import warnings", w);

// 1. Every line: the amounts, the VAT the team pays and when it is due -----------------------
{
  let index = 0;
  for (const area of raw.areas) {
    const sheet = sheetOf(workbook, area.name);
    for (const project of area.projects) {
      for (const rawLine of project.lines) {
        const mine = lines[index++]!; // the engine orders lines like the sheet (area, project, row)
        const oracle = lineOracle(sheet, rawLine.sheetRow);
        for (const phase of phases) {
          const o = oracle[phase];
          const m = mine[phase];
          const where = `${area.name} row ${rawLine.sheetRow} ${phase}`;
          const g = "lines";
          report.money(g, `${where} net`, o.net, m.amounts.netCents, perLine);
          report.money(g, `${where} vat`, o.vat, m.amounts.vatCents, perLine);
          report.money(g, `${where} gross`, o.gross, m.amounts.grossCents, perLine);
          report.money(g, `${where} sponsor`, o.sponsor, m.amounts.sponsorCents, perLine);
          report.money(g, `${where} outflow`, o.outflow, m.amounts.outflowCents, perLine);
          report.money("team VAT", `${where}`, o.teamVat, m.teamVatCents, perLine);
          if (o.vatDue !== null || m.vatDueDate !== null) {
            if (o.vatDue === null) report.skip("team VAT due dates", "the sheet saved no date for some rows (formula without a saved result)");
            else report.equal("team VAT due dates", where, o.vatDue, m.vatDueDate);
          }
        }
      }
    }
  }
}

// 2. Fund balances (CASH FROM summary) ------------------------------------------------------------
{
  const sheet = sheetOf(workbook, "CASH FROM");
  const columns = { estimate: [1, 3], actual: [7, 9] } as const;
  for (const phase of phases) {
    const sheetBalances = fundBalances(sheet, columns[phase][0], columns[phase][1]);
    const mine = new Map(fundSummary(snapshot, phase).map((r) => [r.name.toLowerCase(), r]));
    for (const [name, left] of sheetBalances) {
      const row = mine.get(name.toLowerCase());
      const own = countIn((l) => l[phase].fundName?.toLowerCase() === name.toLowerCase());
      if (!row) report.fail("fund balances", `${phase} ${name}: missing in the engine`);
      else report.money("fund balances", `${phase} ${name}`, left, row.leftCents, tolerance(own));
    }
    report.equal("fund balances", `${phase} fund list`, [...sheetBalances.keys()].map((n) => n.toLowerCase()).sort(), [...mine.keys()].sort());
  }
}

// 3. CASH FLOW summary --------------------------------------------------------------------------------
{
  const sheet = sheetOf(workbook, "CASH FLOW");
  for (const [phase, firstCol] of [["estimate", 1], ["actual", 7]] as const) {
    const o = cashFlowFigures(sheet, firstCol);
    const m = cashFlowSummary(snapshot, phase);
    const t = tolerance(lines.length);
    report.money("cash flow", `${phase} total cash flow`, o.total, m.totalCashFlowCents, t);
    report.money("cash flow", `${phase} left value`, o.left, m.leftValueCents, t);
    report.money("cash flow", `${phase} left value - cash from`, o.leftAfterCoverage, m.leftAfterCoverageCents, t);
  }
}

// 4. TOTAL sheet ------------------------------------------------------------------------------------------
{
  const sheet = sheetOf(workbook, "TOTAL");
  const mine = totals(snapshot);
  mine.blocks.forEach((block, b) => {
    [...block.rows, { ...block.total, areaName: "TOTAL", areaCode: "" }].forEach((row, r) => {
      const o = totalCells(sheet, b, 3 + r);
      const where = `${block.block} / ${row.areaName}`;
      const n = countIn((l) => (block.block === "ALL" || l.category === block.block) && (row.areaName === "TOTAL" || l.areaName === row.areaName));
      const mineValues = [
        row.estimateGrossCents, row.estimateSponsorCents, row.estimateOutflowCents,
        row.actualGrossCents, row.actualSponsorCents, row.actualOutflowCents,
      ];
      o.values.forEach((expected, i) => report.money("TOTAL cells", `${where} #${i + 1}`, expected, mineValues[i]!, tolerance(n)));
      // Variances are ratios: compare presence, and value to within the rounding noise.
      for (const [label, expected, actual] of [
        ["outflow variance", o.outflowVariance, row.outflowVariance],
        ["sponsor variance", o.sponsorVariance, row.sponsorVariance],
      ] as const) {
        if ((expected === null) !== (actual === null)) report.fail("TOTAL variances", `${where} ${label}: sheet ${expected} vs engine ${actual}`);
        else if (expected !== null && Math.abs(expected - actual!) > 0.002) report.fail("TOTAL variances", `${where} ${label}: sheet ${expected} vs engine ${actual}`);
        else report.equal("TOTAL variances", where, true, true);
      }
    });
  });
}

// 5. VAT report (columns AK.. of each area sheet) --------------------------------------------------------
{
  raw.areas.forEach((area) => {
    const sheet = sheetOf(workbook, area.name);
    const mine = vatReport(snapshot, slug(area.name));
    const deadlines = vatReportDeadlines(sheet);
    if (deadlines.length === 0) return report.skip("VAT report", `${area.name}: no report in the sheet`);
    report.equal("VAT report", `${area.name} deadlines`, deadlines, mine.deadlines);
    if (JSON.stringify(deadlines) !== JSON.stringify(mine.deadlines)) return;
    area.projects.forEach((project, i) => {
      if (project.subtotalRow === 0) return;
      const m = mine.projects[i]!;
      const n = project.lines.length;
      vatReportRow(sheet, project.subtotalRow - 1, deadlines.length).forEach((expected, d) =>
        report.money("VAT report", `${area.name} / ${project.name} estimate ${deadlines[d]}`, expected, m.estimateCents[d]!, tolerance(n)));
      vatReportRow(sheet, project.subtotalRow, deadlines.length).forEach((expected, d) =>
        report.money("VAT report", `${area.name} / ${project.name} actual ${deadlines[d]}`, expected, m.actualCents[d]!, tolerance(n)));
    });
  });
}

// 6. GANTT sheets --------------------------------------------------------------------------------------------
{
  const areaNames = snapshot.areas.map((a) => a.name);
  for (const [phase, sheetName] of [["estimate", "EXPECTED GANTT"], ["actual", "ACTUAL GANTT"]] as const) {
    const oracle = readGantt(sheetOf(workbook, sheetName), areaNames, lookups.categories);
    const mine = gantt(snapshot, phase);
    const g = `${sheetName} tables`;

    report.equal(g, "months", oracle.months, mine.months);
    report.equal(g, "blocks", [...oracle.blocks.keys()], mine.blocks.map((b) => b.block));

    const compareMonths = (label: string, expected: Map<string, number>, actual: Record<string, number>, n: number) => {
      for (const month of new Set([...expected.keys(), ...Object.keys(actual)])) {
        report.money(g, `${label} ${month}`, expected.get(month) ?? 0, actual[month] ?? 0, tolerance(n));
      }
    };
    for (const block of mine.blocks) {
      const o = oracle.blocks.get(block.block);
      if (!o) continue;
      const inBlock = (l: (typeof lines)[number]) => block.block === "ALL" || l.category === block.block;
      compareMonths(`${block.block} TOTAL`, o.total, block.total.byMonth, countIn(inBlock));
      report.equal(g, `${block.block} areas`, [...o.areas.keys()], block.areas.map((a) => a.areaName));
      for (const area of block.areas) {
        const oa = o.areas.get(area.areaName);
        if (!oa) continue;
        const n = countIn((l) => inBlock(l) && l.areaName === area.areaName);
        compareMonths(`${block.block}/${area.areaName} monthly sum`, oa.monthlySum, area.monthlySum, n);
        report.equal(g, `${block.block}/${area.areaName} rows`, [...oa.rows.keys()].sort(), area.rows.map((r) => r.name).sort());
        for (const row of area.rows) {
          const expected = oa.rows.get(row.name);
          if (expected) compareMonths(`${block.block}/${area.areaName}/${row.name}`, expected, row.byMonth, n);
        }
      }
    }
    teamFund(phase, sheetName, oracle);
  }

  function teamFund(phase: Phase, sheetName: string, oracle: GanttOracle) {
    const g = `${sheetName} Team's fund table`;
    if (oracle.teamFund === null) {
      return report.skip(g, `the sheet has no table for ${phase} (only the title): its script swallowed an error`);
    }
    const mine = gantt(snapshot, phase).teamFund;
    report.equal(g, "months", oracle.teamFund.rows.map((r) => r.month), mine.rows.map((r) => r.month));
    const n = tolerance(lines.length);
    oracle.teamFund.rows.forEach((row, i) => {
      const m = mine.rows[i];
      if (!m) return;
      const expected = row.values.map((v) => v ?? 0);
      const actual = [m.inflowCents, m.outflowAllCents, ...mine.categories.map((c) => m.outflowByCategory[c] ?? 0), m.outflowVatCents, m.finalCents ?? 0];
      expected.forEach((e, k) => report.money(g, `${row.month} column ${k + 1}`, e, actual[k] ?? 0, n));
    });
  }
}

// 7. CASH FROM ANALYSES and BOUGHT FROM ANALYSES -------------------------------------------------------------
{
  const blocks = ["ALL", ...lookups.categories];
  const lower = (s: string | null) => (s === null ? null : s.toLowerCase());
  const check = (sheetName: string, mine: Analysis) => {
    const g = sheetName;
    const o = readAnalysis(sheetOf(workbook, sheetName), blocks.length);
    blocks.forEach((block, b) => {
      for (const [side, nameOf, offset] of [["estimate", (r: (typeof o.rows)[number]) => r.estimateName, 0], ["actual", (r: (typeof o.rows)[number]) => r.actualName, 3]] as const) {
        const sheetSide = new Map(o.rows.filter((r) => nameOf(r) !== null).map((r) => [lower(nameOf(r))!, r.blocks[b]!.slice(offset, offset + 3).map((v) => v ?? 0)]));
        const mineSide = new Map(
          mine.names.map((n, i) => [lower(side === "estimate" ? n.estimate : n.actual), mine.blocks[b]!.rows[i]![side]] as const)
            .filter(([name]) => name !== null)
            .map(([name, cell]) => [name!, cell ? [cell.grossCents, cell.sponsorCents, cell.outflowCents] : [0, 0, 0]] as const),
        );
        for (const name of new Set([...sheetSide.keys(), ...mineSide.keys()])) {
          const expected = sheetSide.get(name);
          const actual = mineSide.get(name);
          const zero = (v: number[] | undefined) => v === undefined || v.every((x) => x === 0);
          if (expected === undefined || actual === undefined) {
            if (!zero(expected) || !zero(actual)) report.fail(g, `${block} ${side} "${name}": only on one side`);
            else report.skip(g, "rows with all zeros that exist on one side only (a supplier or fund that is listed but unused)");
            continue;
          }
          const n = countIn((l) => (block === "ALL" || l.category === block) && l[side].fundName?.toLowerCase() === name || l[side].supplierName?.toLowerCase() === name);
          expected.forEach((e, k) => report.money(g, `${block} ${side} "${name}" #${k + 1}`, e, actual[k]!, tolerance(n)));
        }
      }
      const total = [mine.blocks[b]!.total.estimate, mine.blocks[b]!.total.actual].flatMap((c) => [c.grossCents, c.sponsorCents, c.outflowCents]);
      o.totals[b]!.forEach((e, k) => report.money(g, `${block} TOTAL #${k + 1}`, e, total[k]!, tolerance(lines.length)));
    });
  };
  check("CASH FROM ANALYSES", analysisByFund(snapshot));
  check("BOUGHT FROM ANALYSES", analysisBySupplier(snapshot));
}

// 8. CATEGORY ANALYSES ---------------------------------------------------------------------------------------------
{
  const o = readCategoryAnalysis(sheetOf(workbook, "CATEGORY ANALYSES"));
  const priority = ["High", "Medium", "Low"].includes(o.filters.priority ?? "") ? o.filters.priority : o.filters.priority === "High → Low" ? "high-to-low" : o.filters.priority === "Low → High" ? "low-to-high" : "all";
  const sort = o.filters.sort?.startsWith("Actual") ? "actual-date" : o.filters.sort?.startsWith("Area") ? "area-project" : "estimate-date";
  const categories = o.filters.categories === null || o.filters.categories === "All Categories" ? [] : o.filters.categories.split(/[,;]/).map((s) => s.trim());
  const mine = itemsView(snapshot, { categories, priority: priority as never, sort });
  report.equal("CATEGORY ANALYSES", `row count (filters: ${JSON.stringify(o.filters)})`, o.rows.length, mine.rows.length);
  o.rows.forEach((row, i) => {
    const m = mine.rows[i];
    if (!m) return;
    const where = `row ${i + 1}`;
    report.equal("CATEGORY ANALYSES", `${where} identity`, [row.area, row.project, row.item, row.category, row.priority], [m.areaName, m.projectName, m.item, m.category, m.priority]);
    report.equal("CATEGORY ANALYSES", `${where} funds, suppliers, dates`, [row.estimateFund, row.estimateSupplier, row.estimateDate, row.actualFund, row.actualSupplier, row.actualDate], [m.estimate.fundName, m.estimate.supplierName, m.estimate.purchaseDate, m.actual.fundName, m.actual.supplierName, m.actual.purchaseDate]);
    report.money("CATEGORY ANALYSES", `${where} estimate outflow`, row.estimateOutflow, m.estimate.outflowCents);
    report.money("CATEGORY ANALYSES", `${where} actual outflow`, row.actualOutflow, m.actual.outflowCents);
  });
}

const ok = report.print();
if (fromDb) {
  const { pool } = await import("@erp/api/db");
  await pool.end();
}
process.exit(ok ? 0 : 1);
