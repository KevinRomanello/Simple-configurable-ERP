import { contracts } from "../../core/contracts";
import { bridgeInfo } from "../../platform/platform.public";

// How the bridge between the registry and the access to the ERP presents itself to the core (docs/moduli-architettura.md, §8): it answers
// under /api/registry-access/… and is on only while the registry is. It is read when the server starts (wiring.ts).

contracts.declare(bridgeInfo, "registry-access", {
  key: "registry-access",
  needs: ["registry"],
  hides: "the roles of the ERP taken from the registry",
});
