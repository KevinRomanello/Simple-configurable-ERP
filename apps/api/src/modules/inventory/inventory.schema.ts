import { PRICE_BASES, PRICE_METHODS } from "@erp/calc";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, longText, lookupCode, optionalText, shortText } from "../../core/validation";

// Input shapes of the inventory endpoints. Quantities are decimals with up to three decimals,
// prices with up to four; the services turn them into thousandths and ten-thousandths.

const quantity = decimal(3, LIMITS.quantity);
const price = decimal(4, LIMITS.unitCost);
const spot = shortText(100).or(z.literal("")).default("");

/** What an item is: everything except the stock, which comes from movements. */
const itemFields = {
  code: shortText(50).nullable(),
  name: shortText(),
  purpose: optionalText(),
  category: lookupCode.nullable(),
  unit: shortText(20),
  safetyCodes: optionalText(),
  disposal: optionalText(),
  storageNotes: optionalText(),
  maintenanceNotes: optionalText(),
};

export const createItemInput = z.object({
  ...itemFields,
  code: itemFields.code.default(null),
  purpose: itemFields.purpose.default(null),
  category: itemFields.category.default(null),
  unit: itemFields.unit.default("pcs"),
  safetyCodes: itemFields.safetyCodes.default(null),
  disposal: itemFields.disposal.default(null),
  storageNotes: itemFields.storageNotes.default(null),
  maintenanceNotes: itemFields.maintenanceNotes.default(null),
  /** "made" items have a bill of materials; the origin cannot be changed afterwards. */
  origin: z.enum(["bought", "made"]).default("bought"),
});
export type CreateItemInput = z.infer<typeof createItemInput>;

export const updateItemInput = z.object(itemFields).partial();
export type UpdateItemInput = z.infer<typeof updateItemInput>;

/** A picture: the full one and a small one for the lists, as base64 text. */
export const imageInput = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  full: z.string().max(900_000),
  thumb: z.string().max(130_000),
});
export const IMAGE_LIMITS = { full: 600_000, thumb: 80_000 } as const;

/** How prices are read: which price, which method, on which day (today by default). */
export const priceQuery = z.object({
  basis: z.enum(PRICE_BASES).default("net"),
  method: z.enum(PRICE_METHODS).default("last"),
  on: isoDate.optional(),
});
export type PriceQuery = z.infer<typeof priceQuery>;

export const itemsQuery = priceQuery.extend({
  search: shortText().optional(),
  category: lookupCode.optional(),
  origin: z.enum(["bought", "made"]).optional(),
  location: lookupCode.optional(),
});

/**
 * Goods that arrived. Either they complete a purchase of the budget (`lineId`: the prices come
 * from the line), or they come from outside the budget (`unitNet` and `vatRate`, or `free`).
 * Either an existing item or a new one.
 */
export const receiveInput = z
  .object({
    lineId: id.optional(),
    itemId: id.optional(),
    newItem: createItemInput.optional(),
    quantity,
    receivedOn: isoDate,
    location: lookupCode,
    spot,
    unitNet: price.optional(),
    vatRate: z.number().min(0).max(100).optional(),
    /** Nobody paid for it (a gift): its value is recorded, its cost for the team is zero. */
    free: z.boolean().default(false),
    projectId: id.optional(),
    note: longText.optional(),
  })
  .refine((v) => (v.itemId === undefined) !== (v.newItem === undefined), "Give either an existing item or a new one")
  .refine((v) => (v.lineId === undefined) !== (v.unitNet === undefined), "Give either a budget line or a price")
  .refine((v) => v.lineId === undefined || (v.vatRate === undefined && !v.free), "The price of a budget line comes from the budget");

/** The other things that happen to goods on the shelf. */
export const movementInput = z
  .object({
    itemId: id,
    kind: z.enum(["use", "transfer", "adjustment", "disposal"]),
    /** use, transfer, disposal */
    quantity: quantity.optional(),
    /** adjustment: how many there really are at that place */
    counted: quantity.optional(),
    occurredOn: isoDate,
    location: lookupCode,
    spot,
    toLocation: lookupCode.optional(),
    toSpot: spot.optional(),
    projectId: id.optional(),
    note: longText.optional(),
  })
  .refine((v) => (v.kind === "adjustment") === (v.counted !== undefined), "A count needs `counted`, and only a count")
  .refine((v) => (v.kind === "adjustment") === (v.quantity === undefined), "Give `quantity` for everything but a count")
  .refine((v) => (v.kind === "transfer") === (v.toLocation !== undefined), "A transfer needs a destination, and only a transfer");

export const partInput = z.object({ partId: id, quantity, note: optionalText(500).default(null) });
export const updatePartInput = z.object({ quantity: quantity.optional(), note: optionalText(500).optional() });

export const statsQuery = z.object({
  by: z.enum(["project", "area", "category", "location"]).default("project"),
  basis: z.enum(PRICE_BASES).default("net"),
});
