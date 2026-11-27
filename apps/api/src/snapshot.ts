// What the tools outside the server read of it (package.json, "exports": tools/import-xlsx): the snapshot of a season as the server sees
// it. It reads every contract first (./wiring): without them the ports would give their plain answers, and a tool would see a budget alone,
// with nothing paid by the register, nothing arrived on the shelf, no ADMINISTRATION and the BANK written by hand.
import "./wiring";

export { loadSnapshot } from "./modules/budget/snapshot";
