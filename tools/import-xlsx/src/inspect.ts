import { loadLookups } from "@erp/api/lookups";
import { openWorkbook, readInputs } from "./read-inputs";
import { toSnapshot } from "./to-snapshot";

// Quick look at what the importer understood from the workbook (counts only, no real data).
const path = process.argv[2] ?? "../../fonti/Budget 26-27.xlsx";
const raw = readInputs(await openWorkbook(path));
const { snapshot, warnings } = toSnapshot(raw, await loadLookups());

console.log("areas:", snapshot.areas.map((a) => a.name).join(", "));
for (const area of raw.areas) {
  console.log(
    ` ${area.name}: ${area.projects.length} projects, ${area.projects.reduce((n, p) => n + p.lines.length, 0)} lines,`,
    `owners: ${area.projects.filter((p) => p.ownerName).length}`,
  );
}
console.log("lines:", snapshot.lines.length, "| projects:", snapshot.projects.length);
console.log("funds:", snapshot.funds.length, "| contracts:", snapshot.contracts.length, "| inflows:", snapshot.inflows.length);
console.log("suppliers:", snapshot.suppliers.length, "| bank:", snapshot.bank);
console.log("warnings:", warnings.length ? warnings : "none");
