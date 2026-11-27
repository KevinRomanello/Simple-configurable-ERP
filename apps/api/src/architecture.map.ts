// Who owns what in the server: the data the architecture tests (`architecture.test.ts`) check the code against.
// The design is docs/moduli-architettura.md (ADR-2): a core (`platform`) that is always on, modules that can be turned off
// (`budget`, `treasury`, `inventory`, `registry`) and bridges, each between two modules, that hold what needs both.
//
// The folders still have today's names: this file says which owner each one belongs to, and the exceptions say where the
// code still does not obey (docs/moduli-architettura.md, §2.2). The step of the plan that fixes a violation takes it out of the
// list; the tests fail for a violation that is not in the list and for one that is in it and is gone, so the list only shrinks.

export type Owner =
  | "platform"
  | "budget"
  | "treasury"
  | "inventory"
  | "registry"
  | "treasury-budget"
  | "inventory-budget"
  | "registry-access";

/** A bridge (a folder of `apps/api/src/bridges/`) is on only when its modules are on; it reaches them through their `*.public.ts`. Nobody but `app.ts` imports it. */
export const BRIDGES: Partial<Record<Owner, Owner[]>> = {
  "treasury-budget": ["treasury", "budget"],
  "inventory-budget": ["inventory", "budget"],
  "registry-access": ["registry"],
};

/** The folders of `apps/api/src/modules`, with the owner each is meant to have (what is under `platform/` is the core, and `snapshot.ts` is the budget's). */
export const FOLDER_OWNERS: Record<string, Owner> = {
  budget: "budget",
  funds: "budget",
  suppliers: "budget",
  views: "budget",
  cashflow: "budget",
  treasury: "treasury",
  inventory: "inventory",
  registry: "registry",
};

/** The owner of `src/snapshot.ts`: the whole calculation of the budget reads from it. */
export const SNAPSHOT_OWNER: Owner = "budget";

/**
 * The schema files of `db/schema/` (the tables of each owner, nothing else): a table is reached by importing the file of its owner, so the
 * rules on imports are also the rules on tables. `db/schema.ts` has them all, for the client of the database, the tools and the tests.
 */
export const SCHEMA_FILES: Owner[] = ["platform", "budget", "treasury", "inventory", "registry", "treasury-budget", "inventory-budget", "registry-access"];

/**
 * Where the code reaches into another owner's files or tables today, as `file → what it imports`, from `apps/api/src` (a table is its owner's
 * schema file: `db/schema/budget`). Each is a place a
 * step of the plan (G1–G6) has to untie; when it does, the line goes.
 */
export const IMPORT_EXCEPTIONS: string[] = [
  // empty since G5 tappa 3 (27 November 2026): every owner reaches the others only through their public files and the contracts of the core
];
