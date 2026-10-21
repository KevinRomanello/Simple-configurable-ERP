import { roundDiv } from "./money";
import type { CalcLine } from "./lines";

// Where a purchase stands between "bought" and "on the shelf". The budget says what was bought
// (the ACTUAL phase of a line); the inventory says what arrived (its receipts). The state is
// worked out from the two numbers and never stored.

/**
 *   planned   nothing bought yet (only the EXPECTED phase)
 *   ordered   bought, nothing arrived: "pending"
 *   partial   some of it arrived
 *   received  all of it arrived
 *   over      more arrived than was bought (the budget was lowered after the arrivals)
 */
export type ArrivalStatus = "planned" | "ordered" | "partial" | "received" | "over";

export interface Arrival {
  boughtMilli: number;
  receivedMilli: number;
  status: ArrivalStatus;
}

export function arrivalStatus(boughtMilli: number, receivedMilli: number): ArrivalStatus {
  if (receivedMilli > boughtMilli) return "over";
  if (boughtMilli === 0) return "planned";
  if (receivedMilli === 0) return "ordered";
  return receivedMilli < boughtMilli ? "partial" : "received";
}

export function arrivalOf(boughtMilli: number, receivedMilli: number): Arrival {
  return { boughtMilli, receivedMilli, status: arrivalStatus(boughtMilli, receivedMilli) };
}

/** What one unit of a bought line costs, in ten-thousandths of a euro. */
export interface UnitPricesE4 {
  /** before VAT */
  net: number;
  /** with VAT */
  gross: number;
  /** what the team pays: the outflow of the line (gross minus the sponsor) */
  team: number;
}

/** Unit prices of a line as bought (ACTUAL phase); null when nothing was bought. */
export function linePricesE4(line: CalcLine): UnitPricesE4 | null {
  const figures = line.actual.figures;
  if (!figures || figures.quantityMilli <= 0) return null;
  const { amounts } = line.actual;
  // cents x 100 000 / thousandths = ten-thousandths of a euro per unit
  const perUnit = (cents: number) => roundDiv(cents * 100_000, figures.quantityMilli);
  return { net: figures.unitCostE4, gross: perUnit(amounts.grossCents), team: perUnit(amounts.outflowCents) };
}
