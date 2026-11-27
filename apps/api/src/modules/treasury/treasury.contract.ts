import { contracts } from "../../core/contracts";
import { auditLabels, auditText, permissionRules, userFlags } from "../../platform/platform.public";

// What the register of the team's money gives the core: the Treasury box of a person and the names the History gives its rows. It is read when the server starts (app.ts).

contracts.declare(auditLabels, "treasury", {
  cash_entry: (row) => auditText(row, "description"),
  cash_opening: (row) => `${auditText(row, "account")} on 1 January ${String(row.year ?? "")}`,
});

contracts.declare(userFlags, "treasury", {
  key: "treasury",
  label: "Treasury",
  explanation: "Keeps the money of the team: the register, and the BANK and the inflows of CASH FLOW",
  roles: ["pm"],
});

contracts.declare(permissionRules, "treasury", {
  key: "canManageCash",
  // the money of the team (the register, the BANK and the inflows of CASH FLOW): the admins and the project managers with the treasury box
  rule: (user) => user.role === "admin" || (user.role === "pm" && user.flags.includes("treasury")),
});
