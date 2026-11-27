import { inventoryBudgetManifest } from "./bridges/inventory-budget";
import { treasuryBudgetManifest } from "./bridges/treasury-budget";
import { budgetManifest } from "./modules/budget";
import { inventoryManifest } from "./modules/inventory";
import { registryManifest } from "./modules/registry";
import { treasuryManifest } from "./modules/treasury";
import { platformManifest } from "./platform";
import type { Manifest } from "./platform/manifest";

/**
 * Every part of the site: the platform, the modules and the bridges (docs/moduli-architettura.md, §7.2). The only list that names
 * them all; what is on decides what is shown.
 */
export const MANIFESTS: Manifest[] = [platformManifest, budgetManifest, treasuryManifest, inventoryManifest, registryManifest, treasuryBudgetManifest, inventoryBudgetManifest];
