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
  cash: "treasury",
  inventory: "inventory",
  registry: "registry",
};

/** The owner of `src/snapshot.ts`: the whole calculation of the budget reads from it. */
export const SNAPSHOT_OWNER: Owner = "budget";

/**
 * The schema files of `db/schema/` (the tables of each owner, nothing else): a table is reached by importing the file of its owner, so the
 * rules on imports are also the rules on tables. `db/schema.ts` has them all, for the client of the database, the tools and the tests.
 */
export const SCHEMA_FILES: Owner[] = ["platform", "budget", "treasury", "inventory", "registry", "treasury-budget", "registry-access"];

/**
 * Where the code reaches into another owner's files or tables today, as `file → what it imports`, from `apps/api/src` (a table is its owner's
 * schema file: `db/schema/budget`). Each is a place a
 * step of the plan (G1–G6) has to untie; when it does, the line goes.
 */
export const IMPORT_EXCEPTIONS: string[] = [
  // the links between modules that are columns (docs/moduli-architettura.md, §2.3): the two of the treasury are tables of the bridge now
  // (`inflow_receipt`, `category_voce`); the three of the inventory become tables of its bridge, G5
  "db/schema/inventory → db/schema/budget", // stock_movement.budget_line_id and project_id, inventory_item.make_project_id
  // treasury (cash) pays lines of the budget, ties movements to them, and asks the budget's calculation: bridge, G4
  "modules/cash/cash-links.service → db/schema/budget",
  "modules/cash/cash-links.service → db/schema/treasury-budget",
  "modules/cash/cash-lists.service → db/schema/treasury-budget",
  "modules/cash/cash-links.service → snapshot",
  "modules/cash/cash.service → db/schema/budget",
  "modules/cash/cash.service → db/schema/treasury-budget",
  "modules/cash/outside-budget.service → db/schema/treasury-budget",
  // the cash flow of the budget writes the register's movements (inflow received, inflow deleted) and uses its own functions: bridge, G4
  "modules/cashflow/cashflow.routes → modules/cash/cash.schema",
  "modules/cashflow/cashflow.service → db/schema/treasury",
  "modules/cashflow/cashflow.service → db/schema/treasury-budget",
  "modules/cashflow/cashflow.service → modules/cash/cash.schema",
  "modules/cashflow/cashflow.service → modules/cash/cash.service",
  "modules/cashflow/inflow-delete.service → db/schema/treasury",
  "modules/cashflow/inflow-delete.service → db/schema/treasury-budget",
  "modules/cashflow/inflow-delete.service → modules/cash/cash.service",
  // the inventory reads the projects and the lines of the budget (PENDING, the project of a movement, the statistics): bridge, G5
  "modules/inventory/items.service → db/schema/budget",
  "modules/inventory/movements.service → db/schema/budget",
  "modules/inventory/movements.service → snapshot",
  "modules/inventory/stats.service → db/schema/budget",
  "modules/inventory/stats.service → snapshot",
  // the common lists and Settings keep the inventory's lists (units, places, fields of a category): they move with the inventory, G5
  "platform/lookups/lookups.service → db/schema/inventory",
  "platform/settings/settings.service → db/schema/inventory",
  // the calculation reads what the register paid, what it says is outside the budget and what arrived: ports, G6
  "snapshot → db/schema/inventory",
  "snapshot → modules/cash/cash.service",
  "snapshot → modules/cash/outside-budget.service",
];
