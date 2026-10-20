import { z } from "zod";

// Runtime configuration, validated once at startup so a bad value fails fast
// instead of surfacing later as an obscure connection error.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = schema.parse(process.env);
