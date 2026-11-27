// Every contract of the server, read once (docs/moduli-architettura.md, §5): what the modules and the bridges answer to the core and to
// each other. A contract that is not read here does nothing, silently: its ports keep their plain answers and its rules are not there. So
// everything that runs the ERP reads this file: the server and its tests through app.ts, the tools outside it through snapshot.ts. The
// architecture test fails for a `*.contract.ts` that is not here, and for one read anywhere else.
//
// The order is the order of the declarations: the Treasury box comes before the Sponsors one in Users, and the budget is named first in a
// message that lists who uses a category.
import "./modules/treasury/treasury.contract";
import "./modules/budget/budget.contract";
import "./modules/inventory/inventory.contract";
import "./bridges/treasury-budget/treasury-budget.contract";
import "./bridges/inventory-budget/inventory-budget.contract";
import "./modules/registry/registry.contract";
import "./bridges/registry-access/registry-access.contract";
