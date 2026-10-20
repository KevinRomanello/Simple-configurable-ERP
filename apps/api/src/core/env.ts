import { z } from "zod";

// Runtime configuration, validated once at startup so a bad value fails fast
// instead of surfacing later as an obscure connection error.
const schema = z.object({
  /** The API's own database user: reads and writes the data, cannot change the structure. */
  DATABASE_URL: z.string().min(1),
  /** The owner of the tables: used only by migrations, the seed and `db:roles`, never by the API. */
  DATABASE_OWNER_URL: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** true only when the API is reachable through a reverse proxy and nothing else (see core/security.ts) */
  TRUST_PROXY: z.stringbool().default(false),
});

export const env = schema.parse(process.env);

/** Where the tools that change the database connect; one single user is fine for a quick local setup. */
export const ownerUrl = env.DATABASE_OWNER_URL ?? env.DATABASE_URL;
