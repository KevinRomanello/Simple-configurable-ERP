import { faBoxesStacked, faChartPie, faPuzzlePiece } from "@fortawesome/free-solid-svg-icons";
import { MenuLink, type Manifest } from "../../platform/manifest";
import { ComponentPage } from "./ComponentPage";
import { ComponentsPage } from "./ComponentsPage";
import { InventoryPage } from "./InventoryPage";
import { InventorySettings } from "./InventorySettings";
import { InventoryStatsPage } from "./InventoryStatsPage";
import { ItemPage } from "./ItemPage";

/** The inventory (docs/moduli-architettura.md, §7.2): the items, the components, the statistics, and its section of Settings. */
export const inventoryManifest: Manifest = {
  key: "inventory",
  routes: [
    { path: "inventory", element: <InventoryPage /> },
    { path: "inventory/items/:id", element: <ItemPage /> },
    { path: "inventory/components", element: <ComponentsPage /> },
    { path: "inventory/components/:id", element: <ComponentPage /> },
    { path: "inventory/stats", element: <InventoryStatsPage /> },
  ],
  menuGroups: [{ id: "inventory", title: "Inventory", order: 60, paths: ["/inventory"] }],
  menu: [
    { group: "inventory", order: 10, element: <MenuLink to="/inventory" icon={faBoxesStacked} end>INVENTORY</MenuLink> },
    { group: "inventory", order: 30, element: <MenuLink to="/inventory/components" icon={faPuzzlePiece}>COMPONENTS</MenuLink> },
    { group: "inventory", order: 40, element: <MenuLink to="/inventory/stats" icon={faChartPie}>INVENTORY STATS</MenuLink> },
  ],
  settings: [
    { key: "inventory", label: "Inventory", order: 20, allowed: (me) => me.permissions.canManageSettings || me.permissions.canManageInventory, Content: InventorySettings },
  ],
};
