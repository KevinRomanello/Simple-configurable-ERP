import { db, pool } from "./client";
import { seedBase } from "./seed-base";

await seedBase(db);
await pool.end();
console.log("Base data seeded.");
