// Money is integer cents; quantities are integer thousandths; unit costs are integer
// ten-thousandths of a euro. Floating point never touches an amount.

/** Integer division rounded half away from zero (the "round to the cent" rule, open question Q7). */
export function roundDiv(numerator: number, denominator: number): number {
  const rounded = Math.sign(numerator) * Math.round(Math.abs(numerator) / denominator);
  return rounded === 0 ? 0 : rounded; // avoid -0
}

/** quantity x unit cost, in cents. */
export function netCents(quantityMilli: number, unitCostE4: number): number {
  // thousandths x ten-thousandths = ten-millionths of a euro; 100 000 of them make one cent.
  return roundDiv(quantityMilli * unitCostE4, 100_000);
}

/** `percent` of an amount in cents. The percent may have up to two decimals (e.g. 4.5). */
export function percentOf(cents: number, percent: number): number {
  return roundDiv(cents * Math.round(percent * 100), 10_000);
}
