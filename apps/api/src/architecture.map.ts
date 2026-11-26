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

/** A bridge is on only when its modules are on; it reaches them through their `*.public.ts`. Nobody but `app.ts` imports it. */
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
  rolesync: "registry-access",
};

/** The owner of `src/snapshot.ts`: the whole calculation of the budget reads from it. */
export const SNAPSHOT_OWNER: Owner = "budget";

/** Every table of `db/schema.ts`, by the name it is exported with, and who owns it. */
export const TABLE_OWNERS: Record<string, Owner> = {
  // the core
  season: "platform",
  area: "platform",
  category: "platform",
  vatRate: "platform",
  setting: "platform",
  appUser: "platform",
  userArea: "platform",
  apiToken: "platform",
  auditLog: "platform",
  appModule: "platform",
  // budget
  project: "budget",
  budgetLine: "budget",
  lineFigures: "budget",
  lineFund: "budget",
  fund: "budget",
  fundContract: "budget",
  supplier: "budget",
  teamInflow: "budget",
  bankSnapshot: "budget",
  // treasury
  cashEntry: "treasury",
  cashCategory: "treasury",
  cashMethod: "treasury",
  cashOpening: "treasury",
  // inventory
  inventoryItem: "inventory",
  itemType: "inventory",
  itemTypeParam: "inventory",
  itemParamValue: "inventory",
  itemImage: "inventory",
  itemDatasheet: "inventory",
  itemDatasheetFile: "inventory",
  stockMovement: "inventory",
  componentPart: "inventory",
  unit: "inventory",
  location: "inventory",
  categoryField: "inventory",
  // registry
  regTable: "registry",
  regField: "registry",
  regView: "registry",
  regRecord: "registry",
  regLink: "registry",
  regFile: "registry",
  regWebhook: "registry",
  regWebhookLog: "registry",
  regSettings: "registry",
  regComment: "registry",
  appSecret: "registry",
  // the bridges
  cashEntryLine: "treasury-budget",
  roleSync: "registry-access",
};

/**
 * Where the code reaches into another owner's files today, as `file → what it imports`, from `apps/api/src`. Each is a place a
 * step of the plan (G1–G6) has to untie; when it does, the line goes.
 */
export const IMPORT_EXCEPTIONS: string[] = [
  // treasury (cash) asks the budget's calculation, and the cash flow of the budget uses the register's own functions: bridge, G4
  "modules/cash/cash-links.service → snapshot",
  "modules/cashflow/cashflow.routes → modules/cash/cash.schema",
  "modules/cashflow/cashflow.service → modules/cash/cash.schema",
  "modules/cashflow/cashflow.service → modules/cash/cash.service",
  "modules/cashflow/inflow-delete.service → modules/cash/cash.service",
  // the inventory asks the budget's calculation (the lines, the projects): bridge, G5
  "modules/inventory/movements.service → snapshot",
  "modules/inventory/stats.service → snapshot",
  // the calculation reads what the register paid and what it says is outside the budget: ports, G6
  "snapshot → modules/cash/cash.service",
  "snapshot → modules/cash/outside-budget.service",
];

/** Where a file uses another owner's table today, as `file uses table`. */
export const TABLE_EXCEPTIONS: string[] = [
  // treasury pays lines of the budget, ties movements to them and reads the inflows received: bridge, G4
  "modules/cash/cash-links.service uses budgetLine",
  "modules/cash/cash-links.service uses cashEntryLine",
  "modules/cash/cash-links.service uses project",
  "modules/cash/cash.service uses budgetLine",
  "modules/cash/cash.service uses cashEntryLine",
  "modules/cash/cash.service uses project",
  "modules/cash/cash.service uses teamInflow",
  "modules/cash/outside-budget.service uses cashEntryLine",
  "modules/cash/outside-budget.service uses teamInflow",
  // the cash flow of the budget writes the register's movements (inflow received, inflow deleted): bridge, G4
  "modules/cashflow/cashflow.service uses cashEntry",
  "modules/cashflow/inflow-delete.service uses cashEntry",
  "modules/cashflow/inflow-delete.service uses cashEntryLine",
  // the inventory reads the projects and the lines of the budget (PENDING, the project of a movement, the statistics): bridge, G5
  "modules/inventory/items.service uses project",
  "modules/inventory/movements.service uses budgetLine",
  "modules/inventory/movements.service uses project",
  "modules/inventory/stats.service uses budgetLine",
  "modules/inventory/stats.service uses project",
  // the common lists read the inventory's lists (units, places, fields of a category): G1 and G5
  "platform/lookups/lookups.service uses categoryField",
  "platform/lookups/lookups.service uses location",
  "platform/lookups/lookups.service uses unit",
  // a new season copies the projects and the sponsors of the budget: the event seasonCreated, G1
  "platform/seasons/seasons.service uses budgetLine",
  "platform/seasons/seasons.service uses fund",
  "platform/seasons/seasons.service uses project",
  // Settings counts who uses a category, a rate, a unit, a place, and renames them in the lines and the items: usedBy and the event lookupRenamed, G1
  "platform/settings/settings.service uses budgetLine",
  "platform/settings/settings.service uses categoryField",
  "platform/settings/settings.service uses fund",
  "platform/settings/settings.service uses inventoryItem",
  "platform/settings/settings.service uses itemType",
  "platform/settings/settings.service uses lineFigures",
  "platform/settings/settings.service uses location",
  "platform/settings/settings.service uses stockMovement",
  "platform/settings/settings.service uses unit",
  // the calculation reads what arrived from the inventory: port, G6
  "snapshot uses stockMovement",
];
