import { CASH_ACCOUNTS } from "@erp/calc";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, longText } from "../../core/validation";

// Input shapes of the bridge endpoints: what pays the lines of the budget, what receives an inflow, and the Voce of a category. An amount is
// always typed positive (the register's own forms say the same: modules/treasury/cash.schema.ts).

const account = z.enum(CASH_ACCOUNTS);
const amount = decimal(2, LIMITS.money).refine((value) => Number(value) > 0, "The amount must be above zero");
const text = longText.pipe(z.string().max(500));

/**
 * "Mark as received": the movement that received an expected inflow, either one already in the register
 * (`entryId`) or a new one made now (the day and the account; the amount is the inflow's unless typed).
 */
export const receiveInput = z.union([
  z.object({ entryId: id }),
  z.object({
    on: isoDate,
    account,
    amount: amount.optional(),
    categoryId: id.nullable().default(null),
    methodId: id.nullable().default(null),
    description: text.optional(),
  }),
]);
export type ReceiveInput = z.infer<typeof receiveInput>;

/** The lines of the budget a payment paid, with how much of each (replaces the links of the season in the menu). */
export const linesInput = z.object({
  lines: z.array(z.object({ lineId: id, amount })).max(200),
});

/** TO PAY: pay lines of the budget with one new payment of the register (one amount for each line). */
export const payInput = z.object({
  on: isoDate,
  account,
  methodId: id.nullable().default(null),
  categoryId: id.nullable().default(null),
  description: text.optional(),
  lines: z.array(z.object({ lineId: id, amount })).min(1).max(100),
});
export type PayInput = z.infer<typeof payInput>;
export const toPayQuery = z.object({ allSeasons: z.enum(["1", "true"]).optional() });

/** The Voce a payment for a line of a budget category starts from; null takes it away. */
export const categoryDefaultInput = z.object({ voceId: id.nullable() });
