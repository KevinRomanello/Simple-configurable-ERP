import { totalOf } from "@erp/calc";
import { contracts } from "../../core/contracts";
import { auditLabels, auditText, bridgeInfo, permissionRules } from "../../platform/platform.public";
import { inflowDeleting, inflowReceipts, linePayments, outsideBudgetOf, registerBank, registerSponsorship } from "../../modules/budget/budget.public";
import { entryChanging, entryLinks, registerBalanceAt, sponsorshipMoneyBetween } from "../../modules/treasury/treasury.public";
import { assertCanDeleteInflow, assertLinksHold, linksOfEntries, paymentsOfLines, receiptsOf } from "./links.service";
import { loadOutsideBudget } from "./outside-budget.service";

// What the bridge between the register and the budget does for both (docs/moduli-architettura.md, §5 and §8): it answers what the budget asks
// of the register (the BANK, the inflows that arrived, the sponsorship money, what the payments paid, what is outside the budget), what the register
// asks of the budget (what each movement is tied to, whether it may change), and it lets the treasury also change the inflows. The bridge is on only
// when both are on, so without it the budget has its plain answers and the register shows nothing tied. It is read when the server starts (app.ts).

const OWNER = "treasury-budget";

// --- what the budget asks of the register ----------------------------------------------------------

contracts.fill(registerBank, OWNER, async (reader, { day }) => {
  const held = await registerBalanceAt(reader, day);
  return held ? { amountCents: totalOf(held) } : null;
});
contracts.fill(inflowReceipts, OWNER, (reader, { inflowIds }) => receiptsOf(reader, inflowIds));
contracts.fill(registerSponsorship, OWNER, async (reader, range) =>
  (await sponsorshipMoneyBetween(reader, range)).map((e) => ({ id: e.id, description: e.description, on: e.on, cents: e.cents })),
);
contracts.fill(linePayments, OWNER, (reader, { lineIds }) => paymentsOfLines(reader, lineIds));
contracts.fill(outsideBudgetOf, OWNER, (reader, { season, area }) => loadOutsideBudget(reader, season, area));

// --- what the register asks of the budget -----------------------------------------------------------

contracts.fill(entryLinks, OWNER, (reader) => linksOfEntries(reader));
contracts.on(entryChanging, OWNER, (tx, change) => assertLinksHold(tx, change));
contracts.on(inflowDeleting, OWNER, (tx, { inflowId, actor }) => assertCanDeleteInflow(tx, inflowId, actor));

// --- who may, and what the History calls the rows of the bridge's tables ------------------------------

contracts.declare(permissionRules, OWNER, {
  key: "canChangeInflows",
  // the treasury also adds and deletes the inflows of CASH FLOW (the admins and the sponsors do it without this)
  rule: (user) => user.role === "pm" && user.flags.includes("treasury"),
});

contracts.declare(auditLabels, OWNER, {
  inflow_receipt: (row) => `inflow ${String(row.inflow_id ?? "")} received by movement ${String(row.entry_id ?? "")}`,
  category_voce: (row) => `Voce ${String(row.voce_id ?? "")} for category ${String(row.category_id ?? "")}`,
});

// what joins it to its modules and goes off with either of them (Settings › App › Modules says it under each)
contracts.declare(bridgeInfo, OWNER, {
  key: OWNER,
  needs: ["treasury", "budget"],
  hides: "TO PAY, the inflows received in the register, the payments tied to budget lines and ADMINISTRATION",
});
