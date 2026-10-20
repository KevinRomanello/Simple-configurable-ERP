import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ownerUrl } from "../core/env";
import * as schema from "./schema";

// The connection of the tools that change the database itself: migrations, the seed and
// `db:roles`. It is the owner of the tables. The API never imports this file; it uses ./client.
export const ownerPool = new pg.Pool({ connectionString: ownerUrl });
export const ownerDb = drizzle(ownerPool, { schema, casing: "snake_case" });
