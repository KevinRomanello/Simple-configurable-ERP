import { parseFlexibleDate } from "@erp/calc";
import { z } from "zod";

// What the API accepts. Everything that reaches the database or the calculations passes through
// here first, so the limits below are the only place that decides "how big is too big".

/** The largest value of an integer column of the database. */
export const MAX_INT = 2_147_483_647;

/**
 * Limits for the numbers people type. They are far above anything a team budget needs, and keep
 * every amount (and every sum of amounts) exactly representable: the calculations work in integer
 * cents, which stop being exact above about 9 x 10^15.
 */
export const LIMITS = {
  /** units of a budget line */
  quantity: 1_000_000,
  /** euros per unit, before VAT */
  unitCost: 10_000_000,
  /** euros: quantity x unit cost of one line, and a typed sponsor value */
  netCost: 100_000_000,
  /** euros: a contract, an inflow, the BANK */
  money: 1_000_000_000,
} as const;

/** The period dates must fall in: wide enough for any budget, narrow enough to rule out typos. */
const FIRST_DATE = "2000-01-01";
const LAST_DATE = "2100-12-31";

/** A real calendar date as YYYY-MM-DD, within the supported period. */
export const isoDate = z
  .string()
  .refine((value) => parseFlexibleDate(value) === value, "Not a valid date (use YYYY-MM-DD)")
  .refine((value) => value >= FIRST_DATE && value <= LAST_DATE, "The date must be between 2000 and 2100");

/**
 * A non-negative decimal with at most `scale` decimals and at most `max`. Accepts a string or a
 * number and always yields the string form, so amounts never go through floating-point arithmetic.
 */
export const decimal = (scale: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(
      z
        .string()
        .regex(new RegExp(`^\\d{1,12}(\\.\\d{1,${scale}})?$`), `Expected a number with at most ${scale} decimals`)
        .refine((value) => Number(value) <= max, `The value cannot be more than ${max.toLocaleString("en-US")}`),
    );

/**
 * A whole number written with digits only, from a JSON number or from a path or query string.
 * (`Number("0x10")` and `Number("1e3")` would also "work": here they are refused.)
 */
const wholeNumber = (min: number, max: number) =>
  z
    .union([z.number(), z.string().regex(/^\d{1,10}$/, "Expected a whole number")])
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

/** The id of a row. */
export const id = wholeNumber(1, MAX_INT);
/** The version of a line, as read before an edit. */
export const version = wholeNumber(1, MAX_INT);
/** How many entries a list returns at most. */
export const pageSize = wholeNumber(1, 500);

/** The database cannot store the NUL character in text: a real person never types it. */
const noNul = (value: string) => !value.includes("\u0000");

/** A short piece of text with something in it: a name, an item. Trimmed. */
export const shortText = (max = 200) =>
  z.string().trim().min(1).max(max).refine(noNul, "The text contains a character that is not allowed");

/** Free text that may be long and may be empty: a note. */
export const longText = z.string().max(5_000).refine(noNul, "The text contains a character that is not allowed");

/** A short code used as a filter or in an address: area codes, table names. */
export const lookupCode = z.string().max(100).refine(noNul, "The text contains a character that is not allowed");
