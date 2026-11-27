import { financialStatement, type StatementEntry, type StatementSpec } from "@erp/calc";
import { today } from "../../core/today";
import { db } from "../../db/client";
import { cashCategory } from "../../db/schema/treasury";
import { assertCanManageCash, loadRegister } from "./cash.service";

// The financial statement of a calendar year, worked out from the register as the sheet of the treasury does
// (docs/registro-di-cassa.md). The rows are the ones of getStatementLayout (below; until G6 it was in the core); the calculation is in @erp/calc.

/** The statement of a year (default: the current one). */
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
  return {
    year: shown,
    years: [...new Set([thisYear, ...entries.map((e) => Number(e.on.slice(0, 4)))])].sort((a, b) => b - a),
    rows: financialStatement(ofYear, layout),
  };
}

/**
 * The rows of the financial statement, in the order and with the labels the team must show (they are copied from the
 * sheet "voci di ricavocosto": docs/registro-di-cassa.md). `row` is the row of that sheet, which the sums refer to. A
 * Voce of the register is counted in the row that has its name, in every account. Three defects of the sheet are
 * corrected on purpose (the treasury agreed on 17 November 2026): Paypal is counted in every row, "4.4 da università"
 * is in section 4 and "PRODUTTIVE MARGINALI" in the total, so that every Voce row is added by some sum.
 */
export async function getStatementLayout(): Promise<StatementSpec[]> {
  // HARDCODED: the rows of the financial statement will be a list of the Settings page, kept by the admin
  return [
    { row: 1, kind: "title", label: "RICAVI" },
    { row: 2, kind: "voce", label: "1. QUOTE ASSOCIATIVE", bold: true },
    { row: 3, kind: "sum", label: "2. CONTRIBUTI DEGLI ASSOCIATI E DEI TESSERATI", of: [4, 5, 6], total: false },
    { row: 4, kind: "voce", label: "2.1 da soci e tesserati", bold: false },
    { row: 5, kind: "voce", label: "2.2 da altre associazioni", bold: false },
    { row: 6, kind: "voce", label: "2.3 da altri (ad es. Federazioni)", bold: false },
    { row: 7, kind: "sum", label: "3. EROGAZIONI LIBERALI RICEVUTE", of: [8, 9], total: false },
    { row: 8, kind: "voce", label: "3.1 da soci", bold: false },
    { row: 9, kind: "voce", label: "3.2 da non soci", bold: false },
    { row: 10, kind: "sum", label: "4. CONTRIBUTI DA ENTI PUBBLICI", of: [11, 12, 13, 14], total: false },
    { row: 11, kind: "voce", label: "4.1 da comune, provincia, regione, stato", bold: false },
    { row: 12, kind: "voce", label: "4.2 da Comunità europea e da altri organismi internazionali", bold: false },
    { row: 13, kind: "voce", label: "4.3 da 5 per mille", bold: false },
    { row: 14, kind: "voce", label: "4.4 da università", bold: false },
    { row: 15, kind: "voce", label: "5. ENTRATE DA ATTIVITA’ COMMERCIALI", bold: true },
    { row: 16, kind: "voce", label: "PRODUTTIVE MARGINALI (Eventi di raccolta fondi)", bold: false },
    { row: 17, kind: "sum", label: "TOTALE RICAVI DA ATTIVITA' ISTITUZIONALE (tipica)", of: [2, 3, 7, 10, 15, 16], total: true },
    { row: 18, kind: "sum", label: "6. ENTRATE COMMERCIALI (da attività accessoria)", of: [19, 20, 21], total: false },
    { row: 19, kind: "voce", label: "6.1 Da pubblicità e sponsorizzazioni", bold: false },
    { row: 20, kind: "voce", label: "6.2 per attività svolte nei confronti di non associati", bold: false },
    { row: 21, kind: "voce", label: "6.3 Entrate commerciali di altro tipo (rimborsi)", bold: false },
    { row: 22, kind: "sum", label: "TOTALE RICAVI DA ATTIVITA' COMMERCIALE (accessoria)", of: [18], total: true },
    { row: 23, kind: "sum", label: "7. ALTRE ENTRATE", of: [24, 25, 26], total: false },
    { row: 24, kind: "voce", label: "7.1 Da rendite patrimoniali", bold: false },
    { row: 25, kind: "voce", label: "7.2 rendite finanziarie", bold: false },
    { row: 26, kind: "voce", label: "7.3 altro: CAMBI ATTIVI", bold: false },
    { row: 27, kind: "sum", label: "TOTALE RICAVI", of: [17, 22, 23], total: true },
    { row: 28, kind: "blank" },
    { row: 29, kind: "title", label: "COSTI" },
    { row: 30, kind: "sum", label: "1. ACQUISTO DI BENI E DI MERCI", of: [31, 32, 33, 34], total: false },
    { row: 31, kind: "voce", label: "1.1 Attrezzature", bold: false },
    { row: 32, kind: "voce", label: "1.2 Cancelleria e materiali da ufficio", bold: false },
    { row: 33, kind: "voce", label: "1.3 Materiale sportivo (per le ASD)", bold: false },
    { row: 34, kind: "voce", label: "1.4 Altro", bold: false },
    { row: 35, kind: "sum", label: "2. ACQUISTO DI SERVIZI", of: [36, 37, 38, 39, 40], total: false },
    { row: 36, kind: "voce", label: "2.1 Assicurazioni", bold: false },
    { row: 37, kind: "voce", label: "2.2 Servizi informatici", bold: false },
    { row: 38, kind: "voce", label: "2.3 Spese postali", bold: false },
    { row: 39, kind: "voce", label: "2.4 Consulenze/ servizi contabili", bold: false },
    { row: 40, kind: "voce", label: "2.5 Altri", bold: false },
    { row: 41, kind: "sum", label: "3. UTENZE (telefono, luce, riscaldamento,…)", of: [42, 43, 44, 45], total: false },
    { row: 42, kind: "voce", label: "3.1 Luce", bold: false },
    { row: 43, kind: "voce", label: "3.2 Acqua", bold: false },
    { row: 44, kind: "voce", label: "3.3 Gas", bold: false },
    { row: 45, kind: "voce", label: "3.4 Altre", bold: false },
    { row: 46, kind: "sum", label: "4. GODIMENTO BENI DI TERZI (affitti e noleggi)", of: [47, 48, 49], total: false },
    { row: 47, kind: "voce", label: "4.1 Affitti", bold: false },
    { row: 48, kind: "voce", label: "4.2 Noleggi", bold: false },
    { row: 49, kind: "voce", label: "4.3 Altri", bold: false },
    { row: 50, kind: "sum", label: "5. AFFILIAZIONI E TESSERAMENTI", of: [51, 52], total: false },
    { row: 51, kind: "voce", label: "5.1 Affiliazioni a federazioni", bold: false },
    { row: 52, kind: "voce", label: "5.2 Altri", bold: false },
    { row: 53, kind: "sum", label: "6. COSTI PER COLLABORATORI", of: [54, 55, 56], total: false },
    { row: 54, kind: "voce", label: "6.1 Costi per collaboratori (occasionali, forfettari e dipendenti)", bold: false },
    { row: 55, kind: "voce", label: "6.2 Rimborsi spese analitici", bold: false },
    { row: 56, kind: "voce", label: "6.3 Altri costi", bold: false },
    { row: 57, kind: "sum", label: "7. COSTI BANCARI", of: [58, 59], total: false },
    { row: 58, kind: "voce", label: "7.1 Commissioni e spese tenuta conto", bold: false },
    { row: 59, kind: "voce", label: "7.2 Altri", bold: false },
    { row: 60, kind: "sum", label: "8. IMPOSTE E TASSE", of: [61, 62, 63, 64], total: false },
    { row: 61, kind: "voce", label: "8.1 IRES/IRAP", bold: false },
    { row: 62, kind: "voce", label: "8.2 Imposta di bollo", bold: false },
    { row: 63, kind: "voce", label: "8.3 Dazi doganali", bold: false },
    { row: 64, kind: "sum", label: "9. IVA", of: [65, 66, 67], total: false },
    { row: 65, kind: "voce", label: "9.1 IVA a credito", bold: false },
    { row: 66, kind: "voce", label: "9.2 IVA a debito", bold: false },
    { row: 67, kind: "voce", label: "9.3 Liquidazione IVA", bold: false },
    { row: 68, kind: "sum", label: "TOTALE COSTI", of: [30, 35, 41, 46, 50, 53, 57, 60], total: true },
    { row: 69, kind: "blank" },
    { row: 70, kind: "result", label: "AVANZO O DISAVANZO DI GESTIONE", plus: 27, minus: 68 },
  ];
}
