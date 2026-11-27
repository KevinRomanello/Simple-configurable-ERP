import { faBookOpen, faFileInvoiceDollar } from "@fortawesome/free-solid-svg-icons";
import { Navigate } from "react-router";
import { MenuLink, type Manifest } from "../../platform/manifest";
import { CashListsPanel } from "./CashListsPanel";
import { CashRegisterPage } from "./CashRegisterPage";
import { StatementPage } from "./StatementPage";

/** The treasury (docs/moduli-architettura.md, §7.2): the register of the team's money, the financial statement, and the lists of the register in Settings. */
export const treasuryManifest: Manifest = {
  key: "treasury",
  routes: [
    { path: "register", element: <CashRegisterPage /> },
    { path: "statement", element: <StatementPage /> },
  ],
  // the team's own money: the register and the financial statement are the treasury's and the admins'; TO PAY (the bridge to the budget)
  // is for who keeps the budget too, so the group shows to whoever sees one of its entries
  menuGroups: [{ id: "treasury", title: "Treasury", order: 40, paths: ["/register", "/statement"] }],
  menu: [
    { group: "treasury", order: 10, shown: (me) => me.permissions.canManageCash, element: <MenuLink to="/register" icon={faBookOpen}>CASH REGISTER</MenuLink> },
    { group: "treasury", order: 30, shown: (me) => me.permissions.canManageCash, element: <MenuLink to="/statement" icon={faFileInvoiceDollar}>FINANCIAL STATEMENT</MenuLink> },
  ],
  settings: [
    { key: "register", label: "Register", order: 30, allowed: (me) => me.permissions.canManageSettings || me.permissions.canManageCash, Content: CashListsPanel },
  ],
  // the register is the treasury's and the admins': for the others the site starts somewhere else
  home: (me) => (me.permissions.canManageCash ? <Navigate to="/register" replace /> : null),
};
