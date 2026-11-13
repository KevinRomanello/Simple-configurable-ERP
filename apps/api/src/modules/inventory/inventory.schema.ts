import { PRICE_BASES, PRICE_METHODS } from "@erp/calc";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, longText, lookupCode, optionalText, shortText } from "../../core/validation";
import { PARAM_KINDS } from "../../db/schema";

// Input shapes of the inventory endpoints. Quantities are decimals with up to three decimals,
// prices with up to four; the services turn them into thousandths and ten-thousandths.

const quantity = decimal(3, LIMITS.quantity);
const price = decimal(4, LIMITS.unitCost);
const spot = shortText(100).or(z.literal("")).default("");

/**
 * A number written in a parameter, in the unit of the parameter: 10 kΩ is "10000", 100 nF is
 * "0.0000001" (the site turns "10k" and "100n" into these). It can be below zero (a temperature).
 */
export const paramNumber = z.string().max(40).regex(/^-?\d{1,15}(\.\d{1,18})?$/, "Expected a number in the unit of the parameter");

/** What is written in a parameter of the item's type; null clears it. The service checks it against the kind. */
const paramValue = z.object({ paramId: id, value: z.union([z.boolean(), z.string().trim().max(200)]).nullable() });

/** What an item is: everything except the stock, which comes from movements. */
const itemFields = {
  code: shortText(50).nullable(),
  name: shortText(),
  purpose: optionalText(),
  category: lookupCode.nullable(),
  areaId: id.nullable(),
  typeId: id.nullable(),
  /** Only the parameters given change: one that is left out keeps what it had. */
  params: z.array(paramValue).max(100),
  unit: shortText(20),
  safetyCodes: optionalText(),
  disposal: optionalText(),
  storageNotes: optionalText(),
  maintenanceNotes: optionalText(),
  /** What the item is: ticked on the form, and what the lists are filtered by. */
  flammable: z.boolean(),
  toxic: z.boolean(),
  carcinogenic: z.boolean(),
};

export const createItemInput = z.object({
  ...itemFields,
  code: itemFields.code.default(null),
  purpose: itemFields.purpose.default(null),
  category: itemFields.category.default(null),
  areaId: itemFields.areaId.default(null),
  typeId: itemFields.typeId.default(null),
  params: itemFields.params.default([]),
  unit: itemFields.unit.default("pcs"),
  safetyCodes: itemFields.safetyCodes.default(null),
  disposal: itemFields.disposal.default(null),
  storageNotes: itemFields.storageNotes.default(null),
  maintenanceNotes: itemFields.maintenanceNotes.default(null),
  flammable: itemFields.flammable.default(false),
  toxic: itemFields.toxic.default(false),
  carcinogenic: itemFields.carcinogenic.default(false),
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
  /** The code of an area (`hw`): its items. */
  area: lookupCode.optional(),
  type: id.optional(),
  /** Each one that is given narrows the list to the items that are so ("true"; two of them: both). */
  flammable: z.stringbool().optional(),
  toxic: z.stringbool().optional(),
  carcinogenic: z.stringbool().optional(),
});

/**
 * What is written in a parameter, as a filter of the list: `p12=0603` (a list: that choice; a text:
 * containing it; yes or no: `yes`/`no`), `p12min=1000` and `p12max=10000` (a number, both ends included).
 */
export interface ParamFilter {
  paramId: number;
  op: "is" | "min" | "max";
  value: string;
}

export function paramFilters(query: Record<string, unknown>): ParamFilter[] {
  return Object.entries(query).flatMap(([key, raw]): ParamFilter[] => {
    const match = /^p(\d{1,10})(min|max)?$/.exec(key);
    if (!match || typeof raw !== "string" || raw.trim() === "") return [];
    const op = (match[2] ?? "is") as ParamFilter["op"];
    const value = op === "is" ? shortText().parse(raw) : paramNumber.parse(raw.trim());
    return [{ paramId: id.parse(match[1]), op, value }];
  });
}

// --- item types (Settings page) ----------------------------------------------------------------

const typeFields = { name: shortText(100), areaId: id.nullable(), hazards: z.boolean(), categoryId: id, parentId: id.nullable() };
/** A new type: of its own (no `parentId`) or a kind of another, which gives it its category when none is given. */
export const createTypeInput = z.object({
  ...typeFields,
  areaId: typeFields.areaId.default(null),
  hazards: typeFields.hazards.default(true),
  categoryId: typeFields.categoryId.optional(),
  parentId: typeFields.parentId.optional(),
});
export const updateTypeInput = z.object(typeFields).partial();

const choice = shortText(100);
const paramFields = {
  name: shortText(100),
  kind: z.enum(PARAM_KINDS),
  unit: optionalText(20),
  prefixes: z.boolean(),
};
export const createParamInput = z.object({
  ...paramFields,
  unit: paramFields.unit.default(null),
  prefixes: paramFields.prefixes.default(false),
  choices: z.array(choice).max(200).default([]),
});
export type CreateParamInput = z.infer<typeof createParamInput>;
/** The choices of a list, in their new order: `was` says which old one an entry is (renamed: the items that had it follow). */
export const updateParamInput = z.object({ ...paramFields, choices: z.array(z.object({ was: choice.optional(), name: choice })).max(200) }).partial();
export type UpdateParamInput = z.infer<typeof updateParamInput>;
export const orderInput = z.object({ ids: z.array(id).max(500) });

/** A data sheet is a PDF; the browser sends the file itself. */
export const DATASHEET_LIMITS = { bytes: 10_000_000 } as const;
export const datasheetQuery = z.object({ name: shortText(200) });

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
    /** Goods from outside the budget bought for the car of another season; without it, the car of the season of the date. */
    carSeasonId: id.optional(),
    note: longText.optional(),
  })
  .refine((v) => (v.itemId === undefined) !== (v.newItem === undefined), "Give either an existing item or a new one")
  .refine((v) => (v.lineId === undefined) !== (v.unitNet === undefined), "Give either a budget line or a price")
  .refine((v) => v.lineId === undefined || (v.vatRate === undefined && !v.free), "The price of a budget line comes from the budget")
  .refine((v) => v.lineId === undefined || v.carSeasonId === undefined, "An arrival of the budget is for the car of its line");

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

/**
 * A build: `quantity` pieces of the made item `componentId`, taking the parts from one place and putting
 * the pieces in another. Their cost is frozen with the prices of the day, read the way `method` says.
 */
export const buildInput = z.object({
  componentId: id,
  /** The project the pieces are made for: the parts taken from the shelf are used for it. */
  projectId: id,
  quantity,
  builtOn: isoDate,
  fromLocation: lookupCode,
  toLocation: lookupCode,
  toSpot: spot,
  method: z.enum(PRICE_METHODS).default("average"),
  note: longText.optional(),
});

export const partInput = z.object({ partId: id, quantity, note: optionalText(500).default(null) });
export const updatePartInput = z.object({ quantity: quantity.optional(), note: optionalText(500).optional() });

export const statsQuery = z.object({
  by: z.enum(["project", "area", "category", "location", "car"]).default("project"),
  basis: z.enum(PRICE_BASES).default("net"),
});
