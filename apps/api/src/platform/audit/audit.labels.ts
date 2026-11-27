import { contracts } from "../../core/contracts";
import { auditLabels, auditText } from "../platform.public";

// How the History names the rows of the core's own tables; the modules say it for theirs (`*.contract.ts`).

contracts.declare(auditLabels, "platform", {
  app_user: (row) => auditText(row, "email"),
  user_area: (row) => `user ${String(row.user_id ?? "")}, area ${String(row.area_id ?? "")}`,
  user_flag: (row) => `user ${String(row.user_id ?? "")}, box ${auditText(row, "flag")}`,
  vat_rate: (row) => `${String(row.rate ?? "")}%`,
  setting: () => "settings",
  app_module: (row) => `module ${auditText(row, "key")}`,
});
