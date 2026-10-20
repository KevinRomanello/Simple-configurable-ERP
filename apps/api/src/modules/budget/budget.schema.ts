import { PRIORITIES, SPONSOR_TYPES } from "@erp/calc";
import { z } from "zod";
import { decimal, id, isoDate } from "../../core/validation";

// Input shapes of the budget endpoints. In `figures` every field is optional: a missing field is
// left as it is, `null` clears it. Money and quantities are decimals in euros / units.
export const figuresInput = z
  .object({
    quantity: decimal(3),
    unitNetCost: decimal(4),
    sponsorType: z.enum(SPONSOR_TYPES).nullable(),
    sponsorValue: decimal(2).nullable(),
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
  item: z.string().trim().min(1),
  category: z.string().nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  note: z.string().nullable(),
  figures: figuresByPhase,
};

export const createProjectInput = z.object({
  areaCode: z.string(),
  name: z.string().trim().min(1),
  ownerName: z.string().trim().min(1).nullish(),
});
export const updateProjectInput = z
  .object({ name: z.string().trim().min(1), ownerName: z.string().trim().min(1).nullable() })
  .partial();

export const createLineInput = z.object({ item: lineFields.item }).extend({
  category: lineFields.category.optional(),
  priority: lineFields.priority.optional(),
  note: lineFields.note.optional(),
  figures: lineFields.figures.optional(),
});
export const updateLineInput = z
  .object({ version: z.number().int().positive() })
  .extend(z.object(lineFields).partial().shape);

export type CreateLineInput = z.infer<typeof createLineInput>;
export type UpdateLineInput = z.infer<typeof updateLineInput>;
