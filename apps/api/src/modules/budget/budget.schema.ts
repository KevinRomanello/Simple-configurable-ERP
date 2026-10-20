import { PRIORITIES, SPONSOR_TYPES } from "@erp/calc";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, longText, lookupCode, shortText, version } from "../../core/validation";

// Input shapes of the budget endpoints. In `figures` every field is optional: a missing field is
// left as it is, `null` clears it. Money and quantities are decimals in euros / units.
export const figuresInput = z
  .object({
    quantity: decimal(3, LIMITS.quantity),
    unitNetCost: decimal(4, LIMITS.unitCost),
    sponsorType: z.enum(SPONSOR_TYPES).nullable(),
    sponsorValue: decimal(2, LIMITS.netCost).nullable(),
    vatRate: z.number().min(0).max(100).nullable(),
    fundId: id.nullable(),
    supplierId: id.nullable(),
    purchaseDate: isoDate.nullable(),
    arrivalDate: isoDate.nullable(),
  })
  .partial();
export type FiguresInput = z.infer<typeof figuresInput>;

const figuresByPhase = z.object({ estimate: figuresInput, actual: figuresInput }).partial();

const lineFields = {
  item: shortText(500),
  category: lookupCode.nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  note: longText.nullable(),
  figures: figuresByPhase,
};

export const createProjectInput = z.object({
  areaCode: lookupCode,
  name: shortText(),
  ownerName: shortText().nullish(),
});
export const updateProjectInput = z
  .object({ name: shortText(), ownerName: shortText().nullable() })
  .partial();

export const createLineInput = z.object({ item: lineFields.item }).extend({
  category: lineFields.category.optional(),
  priority: lineFields.priority.optional(),
  note: lineFields.note.optional(),
  figures: lineFields.figures.optional(),
});
export const updateLineInput = z
  .object({ version })
  .extend(z.object(lineFields).partial().shape);

export type CreateLineInput = z.infer<typeof createLineInput>;
export type UpdateLineInput = z.infer<typeof updateLineInput>;
