import { contracts } from "../../core/contracts";
import { auditLabels, bridgeInfo } from "../../platform/platform.public";
import { computedSeason, lineReceipts, projectsByIds } from "../../modules/budget/budget.public";
import { keepMakeProject, keepMovementProject, knownProjects, lineCarsOfReceipts, makeProjects, movementTies, statsBudget } from "../../modules/inventory/inventory.public";
import { carsOfReceipts, keepMovementProjectIn, lineReceiptsOf, makeProjectsOf, setMakeProject, tiesOf } from "./ties.service";

// What the bridge between the inventory and the budget does for both (docs/moduli-architettura.md, §5 and §8): it answers what the inventory asks
// of the budget (the projects, the ties of the movements, what the statistics need) and what the budget asks of the inventory (what arrived of each
// line). The bridge is on only when both are on: without it the inventory has no project to offer and the budget sees nothing arrived. It is read
// when the server starts (app.ts).

const OWNER = "inventory-budget";

// --- what the inventory asks of the budget ---------------------------------------------------------

contracts.fill(movementTies, OWNER, (reader, { movementIds }) => tiesOf(reader, movementIds));
contracts.fill(knownProjects, OWNER, (reader, { ids }) => projectsByIds(reader, ids));
contracts.fill(keepMovementProject, OWNER, (tx, input) => keepMovementProjectIn(tx, input));
contracts.fill(makeProjects, OWNER, (reader, { itemIds }) => makeProjectsOf(reader, itemIds));
contracts.fill(keepMakeProject, OWNER, (tx, input) => setMakeProject(tx, input));
contracts.fill(statsBudget, OWNER, (_reader, { season }) => computedSeason(season));
contracts.fill(lineCarsOfReceipts, OWNER, (reader, { movementIds }) => carsOfReceipts(reader, movementIds));

// --- what the budget asks of the inventory -----------------------------------------------------------

contracts.fill(lineReceipts, OWNER, (reader) => lineReceiptsOf(reader));

// --- what the History calls the rows of the bridge's tables --------------------------------------------

contracts.declare(auditLabels, OWNER, {
  receipt_line: (row) => `movement ${String(row.movement_id ?? "")} received for line ${String(row.line_id ?? "")}`,
  movement_project: (row) => `movement ${String(row.movement_id ?? "")} for project ${String(row.project_id ?? "")}`,
  item_make_project: (row) => `item ${String(row.item_id ?? "")} made for project ${String(row.project_id ?? "")}`,
});

// what joins it to its modules and goes off with either of them (Settings › App › Modules says it under each)
contracts.declare(bridgeInfo, OWNER, {
  key: OWNER,
  needs: ["inventory", "budget"],
  hides: "PENDING, the arrivals of the budget's purchases and the projects in the inventory",
});
