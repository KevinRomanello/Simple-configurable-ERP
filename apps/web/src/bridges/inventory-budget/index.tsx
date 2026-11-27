import { faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import { inventoryBudgetApi } from "./api";
import { PendingPage } from "./PendingPage";
import { purposeProjects } from "../../modules/inventory/public";
import { fill } from "../../core/slots";
import { MenuLink, type Manifest } from "../../platform/manifest";

/**
 * The bridge between the inventory and the budget (docs/moduli-architettura.md, §4.3): on only while both are. PENDING, in the Inventory
 * group, and the projects of the budget a movement, an arrival or a build of the inventory can be for.
 */
export const inventoryBudgetManifest: Manifest = {
  key: "inventory-budget",
  needs: ["inventory", "budget"],
  routes: [{ path: "inventory/pending", element: <PendingPage /> }],
  menu: [{ group: "inventory", order: 20, element: <MenuLink to="/inventory/pending" icon={faHourglassHalf}>PENDING</MenuLink> }],
  fills: [fill(purposeProjects, inventoryBudgetApi.inventoryProjects)],
};
