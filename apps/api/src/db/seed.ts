import { ownerDb, ownerPool } from "./owner";
import { seedBase } from "./seed-base";

// Setup step: runs as the owner, like the migrations.
await seedBase(ownerDb);
await ownerPool.end();
console.log("Base data seeded.");
