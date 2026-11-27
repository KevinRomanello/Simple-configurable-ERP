import { faBookOpen, faFileInvoiceDollar } from "@fortawesome/free-solid-svg-icons";
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
  // the team's own money, for the treasury and the admins: the register, what is still to pay (the bridge to the budget) and the financial statement
  menuGroups: [{ id: "treasury", title: "Treasury", order: 40, paths: ["/register", "/statement"], useShown: (me) => me.permissions.canManageCash }],
  menu: [
    { group: "treasury", order: 10, element: <MenuLink to="/register" icon={faBookOpen}>CASH REGISTER</MenuLink> },
    { group: "treasury", order: 30, element: <MenuLink to="/statement" icon={faFileInvoiceDollar}>FINANCIAL STATEMENT</MenuLink> },
  ],
  settings: [
    { key: "register", label: "Register", order: 30, allowed: (me) => me.permissions.canManageSettings || me.permissions.canManageCash, Content: CashListsPanel },
  ],
};
