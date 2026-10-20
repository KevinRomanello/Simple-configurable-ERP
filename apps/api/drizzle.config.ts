import { defineConfig } from "drizzle-kit";

// `generate` only reads the schema and writes SQL into ./drizzle; it does not need the database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // TypeScript uses camelCase, SQL gets snake_case (friendlier for analysts querying directly).
  casing: "snake_case",
});
