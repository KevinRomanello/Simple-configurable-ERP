// The whole schema, for who needs every table: the database client, the tools and the tests. A service of the server imports the file of
// its own owner (`./schema/budget`, `./schema/platform`…) and no other: the tests of architecture see to it (docs/moduli-architettura.md, §6).
// `drizzle.config.ts` reads the files of `./schema`, not this one.

export * from "./schema/columns";
export * from "./schema/platform";
export * from "./schema/budget";
export * from "./schema/treasury";
export * from "./schema/inventory";
export * from "./schema/registry";
export * from "./schema/treasury-budget";
export * from "./schema/registry-access";
