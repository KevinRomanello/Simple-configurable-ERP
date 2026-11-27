import { customType, integer } from "drizzle-orm/pg-core";

// What the tables of every owner are written with.

/** Binary data (the pictures of the inventory, the files of the registry). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** The primary key of every table: a whole number the database counts. */
export const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
