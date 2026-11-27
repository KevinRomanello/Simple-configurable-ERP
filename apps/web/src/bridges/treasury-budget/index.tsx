import { faMoneyBillWave } from "@fortawesome/free-solid-svg-icons";
import { CategoryVoci } from "./CategoryVoci";
import { deleteInflow, linkToLines, receiveInflow } from "./rowActions";
import { ToPayPage } from "./ToPayPage";
import { inflowActions } from "../../modules/budget/public";
import { registerRowActions, registerSettings } from "../../modules/treasury/public";
import { fill } from "../../core/slots";
import { MenuLink, type Manifest } from "../../platform/manifest";

/**
 * The bridge between the treasury and the budget (docs/moduli-architettura.md, §4.3): on only while both are. TO PAY and its orders, in the
 * Treasury group; receiving and deleting the inflows of CASH FLOW; linking a payment of the register to budget lines; the Voce of a payment
 * by budget category in Settings › Register.
 */
export const treasuryBudgetManifest: Manifest = {
  key: "treasury-budget",
  needs: ["treasury", "budget"],
  routes: [{ path: "to-pay", element: <ToPayPage /> }],
  // TO PAY is for who keeps the budget: the users group the lines bought in one order, the treasury and the admins pay them
  menu: [{ group: "treasury", order: 20, paths: ["/to-pay"], shown: (me) => me.permissions.canSeeToPay, element: <MenuLink to="/to-pay" icon={faMoneyBillWave}>TO PAY</MenuLink> }],
  fills: [fill(inflowActions, receiveInflow), fill(inflowActions, deleteInflow), fill(registerRowActions, linkToLines), fill(registerSettings, CategoryVoci)],
};
