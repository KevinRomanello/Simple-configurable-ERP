import { contracts } from "../../core/contracts";
import { moduleInfo } from "../../platform/platform.public";

// How the registry presents itself to the core (docs/moduli-architettura.md, §8): its switch in Settings › App › Modules and its addresses,
// /api/registry/… (the public forms and the services' too). It is read when the server starts (wiring.ts).

contracts.declare(moduleInfo, "registry", {
  key: "registry",
  order: 40,
  label: "Registry",
  description: "The registries of the team (the people, the sponsors…), the forms that fill them in, and the keys and webhooks for n8n.",
});
