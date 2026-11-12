import { CASH_ACCOUNTS, CASH_SCOPES } from "@erp/calc";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, longText, shortText } from "../../core/validation";

// Input shapes of the register endpoints (docs/registro-di-cassa.md). An amount is always typed
// positive; `direction` says whether the money comes in or goes out.

const account = z.enum(CASH_ACCOUNTS);
const direction = z.enum(["in", "out"]);
const amount = decimal(2, LIMITS.money).refine((value) => Number(value) > 0, "The amount must be above zero");
const text = longText.pipe(z.string().max(500));

export const createEntryInput = z.object({
  on: isoDate,
  description: text.default(""),
  categoryId: id.nullable().default(null),
  methodId: id.nullable().default(null),
  account,
  direction,
  amount,
  invoiceChecked: z.boolean().default(false),
  sponsorship: z.boolean().default(false),
});
export type CreateEntryInput = z.infer<typeof createEntryInput>;

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

export const updateEntryInput = z
  .object({
    on: isoDate,
    description: text,
    categoryId: id.nullable(),
    methodId: id.nullable(),
    account,
    direction,
    amount,
    invoiceChecked: z.boolean(),
    sponsorship: z.boolean(),
  })
  .partial();
export type UpdateEntryInput = z.infer<typeof updateEntryInput>;

/** An opening balance can be negative; no amount removes it (the year then starts from the year before). */
export const openingInput = z.object({
  year: z.number().int().min(2000).max(2100),
  account,
  amount: z
    .union([z.string().max(20), z.number()])
    .transform(String)
    .pipe(z.string().max(20).regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Expected a number with at most 2 decimals"))
    .nullable(),
});

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

export const registerQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const entryParam = z.object({ id });
export const listInput = z.object({ name: shortText(100), sponsorship: z.boolean().optional(), scope: z.enum(CASH_SCOPES).optional() });
export const updateListInput = z.object({ name: shortText(100), sponsorship: z.boolean(), scope: z.enum(CASH_SCOPES) }).partial();
export const orderInput = z.object({ ids: z.array(id).max(500) });

// --- the import of the sheet of the treasury ----------------------------------------------------------
// The browser reads the .xlsx and sends the rows it found; the API never opens the file.

const sheetRow = z.object({
  row: z.number().int().min(1).max(1_000_000),
  on: isoDate,
  description: z.string().max(2_000),
  category: z.string().max(200).nullable(),
  method: z.string().max(100).nullable(),
  invoiceChecked: z.boolean(),
  account,
  cents: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= LIMITS.money * 100, "The amount is out of range"),
});

const openingCents = z.object({
  cash: z.number().int().min(-LIMITS.money * 100).max(LIMITS.money * 100),
  bank: z.number().int().min(-LIMITS.money * 100).max(LIMITS.money * 100),
  paypal: z.number().int().min(-LIMITS.money * 100).max(LIMITS.money * 100),
});

export const sheetInput = z.object({
  sheetName: z.string().max(200),
  opening: z.object({ label: z.string().max(200).nullable(), cents: openingCents }).nullable(),
  rows: z.array(sheetRow).max(5_000),
});
export type SheetInput = z.infer<typeof sheetInput>;
export type SheetRowInput = SheetInput["rows"][number];

const importOptions = z.object({
  /** The year the sheet is for; without it, the one most of its rows are in. */
  year: z.number().int().min(2000).max(2100).optional(),
  /**
   * Rows dated in another year (a typo, most likely): `skip` leaves them out, `own` loads them in their
   * own year, `year` counts them in the year of the sheet (the same day and month).
   */
  outside: z.enum(["skip", "own", "year"]).default("skip"),
});
export const previewInput = sheetInput.and(importOptions);

/** Voci and methods the site does not have: by default they are created, or they are mapped to one it has. */
const mapTo = z.record(z.string().max(200), z.number().int().nullable());

export const applyInput = sheetInput.and(importOptions).and(
  z.object({
    mode: z.enum(["add", "replace"]),
    /** Replace only: the year typed again to confirm, because it deletes that year's movements. */
    confirmYear: z.number().int().optional(),
    /** Add only: also change the rows that are there with something written differently. */
    updateChanged: z.boolean().default(false),
    categoryMap: mapTo.default({}),
    methodMap: mapTo.default({}),
  }),
);
export type ApplyInput = z.infer<typeof applyInput>;
