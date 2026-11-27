import { faMoneyBillWave } from "@fortawesome/free-solid-svg-icons";
import { MenuLink, type Manifest } from "../../platform/manifest";
import { ToPayPage } from "./ToPayPage";

/** The bridge between the treasury and the budget (docs/moduli-architettura.md, §4.3): on only while both are. TO PAY, in the Treasury group. */
export const treasuryBudgetManifest: Manifest = {
  key: "treasury-budget",
  needs: ["treasury", "budget"],
  routes: [{ path: "to-pay", element: <ToPayPage /> }],
  menu: [{ group: "treasury", order: 20, paths: ["/to-pay"], element: <MenuLink to="/to-pay" icon={faMoneyBillWave}>TO PAY</MenuLink> }],
};
