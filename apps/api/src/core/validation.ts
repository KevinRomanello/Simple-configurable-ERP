import { parseFlexibleDate } from "@erp/calc";
import { z } from "zod";

/** A real calendar date as YYYY-MM-DD. */
export const isoDate = z
  .string()
  .refine((value) => parseFlexibleDate(value) === value, "Not a valid date (use YYYY-MM-DD)");

/**
 * A non-negative decimal with at most `scale` decimals. Accepts a string or a number and always
 * yields the string form, so amounts never go through floating-point arithmetic.
 */
export const decimal = (scale: number) =>
  z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(
      z
        .string()
        .regex(new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`), `Expected a number with at most ${scale} decimals`),
    );

export const id = z.coerce.number().int().positive();
