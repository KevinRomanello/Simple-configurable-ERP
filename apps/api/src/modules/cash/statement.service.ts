import { financialStatement, statementIssues, type StatementEntry } from "@erp/calc";
import { today } from "../../core/today";
import { db } from "../../db/client";
import { cashCategory } from "../../db/schema";
import { getStatementLayout } from "../lookups/lookups.service";
import { assertCanManageCash, loadRegister } from "./cash.service";

// The financial statement of a calendar year, worked out from the register as the sheet of the treasury does
// (docs/registro-di-cassa.md). The rows are the ones of getStatementLayout; the calculation is in @erp/calc.

/** The statement of a year (default: the current one), and what to check in it. */
export async function getStatement(year?: number) {
  await assertCanManageCash();
  const thisYear = Number(today().slice(0, 4));
  const shown = year ?? thisYear;
  const [{ entries }, categories, layout] = await Promise.all([
    loadRegister(),
    db.select({ id: cashCategory.id, name: cashCategory.name }).from(cashCategory),
    getStatementLayout(),
  ]);
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const ofYear: StatementEntry[] = entries
    .filter((e) => e.on.startsWith(String(shown)))
    .map((e) => ({ voce: e.categoryId === null ? null : (nameOf.get(e.categoryId) ?? null), account: e.account, cents: e.cents }));
  const rows = financialStatement(ofYear, layout);
  return {
    year: shown,
    years: [...new Set([thisYear, ...entries.map((e) => Number(e.on.slice(0, 4)))])].sort((a, b) => b - a),
    rows,
    issues: statementIssues(ofYear, layout, rows),
  };
}
