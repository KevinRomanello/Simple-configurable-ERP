import { faClockRotateLeft, faSliders, faUsers } from "@fortawesome/free-solid-svg-icons";
import { AppSettings } from "./AppSettings";
import { HistoryPage } from "./HistoryPage";
import { MenuLink, type Manifest } from "./manifest";
import { SettingsPage } from "./SettingsPage";
import { UsersPage } from "./UsersPage";

/** The platform, always on (docs/moduli-architettura.md, §4.1): Users, Settings, History, and the App section of Settings. */
export const platformManifest: Manifest = {
  key: "platform",
  needs: [],
  routes: [
    { path: "users", element: <UsersPage /> },
    { path: "settings/:section?", element: <SettingsPage /> },
    { path: "history", element: <HistoryPage /> },
  ],
  menuGroups: [{ id: "admin", title: "Admin", order: 100, paths: ["/users", "/settings", "/history"] }],
  menu: [
    { group: "admin", order: 10, shown: (me) => me.permissions.canManageUsers, element: <MenuLink to="/users" icon={faUsers}>Users</MenuLink> },
    // everyone: the look of the site is chosen there; a user keeps the lists of the inventory, and the treasury those of the register
    { group: "admin", order: 20, element: <MenuLink to="/settings" icon={faSliders}>Settings</MenuLink> },
    { group: "admin", order: 30, shown: (me) => me.permissions.canViewHistory, element: <MenuLink to="/history" icon={faClockRotateLeft}>History</MenuLink> },
  ],
  settings: [{ key: "app", label: "App", order: 100, allowed: () => true, Content: AppSettings }],
};
