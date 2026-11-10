import {
  faAnglesLeft, faBars, faBookOpen, faBoxesStacked, faCalendarDays, faCarSide, faChartLine, faChartPie, faClockRotateLeft, faDatabase, faHourglassHalf, faMagnifyingGlass, faPuzzlePiece,
  faRepeat, faRightFromBracket, faSackDollar, faScaleBalanced, faSliders, faTable, faTruckFast, faUsers, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { api } from "../api/client";
import { forgetUser, useMe } from "../lib/auth";
import { useChosenSeasonId, useSeason } from "../lib/season";
import { SCREEN, useMaxWidth } from "../lib/screen";
import { IconButton } from "./Button";
import { ExportProvider } from "./ExportBlocks";
import { SeasonStrip, SeasonSwitcher } from "./SeasonSwitcher";

/** `end`: the link is lit only for its own page, not for the pages below it (INVENTORY next to PENDING). */
function Item({ to, icon, end, children }: { to: string; icon: IconDefinition; end?: boolean; children: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <FontAwesomeIcon icon={icon} fixedWidth />
      {children}
    </NavLink>
  );
}

/** A group of the menu, under its title: the same on a computer, a tablet and a phone. */
function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav className="nav-group">
      <span className="nav-title label-xs bold">{title}</span>
      {children}
    </nav>
  );
}

const SIDEBAR_HIDDEN_KEY = "erp.sidebar-hidden";

/** Whether the menu is hidden; remembered in this browser (and fine without it: the menu is just shown). */
function useSidebarHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? "1" : "0");
    } catch {
      // private window or blocked storage: the choice is simply not remembered
    }
  }, [hidden]);
  return [hidden, () => setHidden((value) => !value)] as const;
}

/**
 * The menu of a phone or a tablet: the same as on a computer, shown over the page from the bar at the top, and closed by
 * itself when the page or the season changes, with Esc or by touching outside it. While it is open the page under
 * it does not scroll, and the entry of the page you are on is in sight.
 */
function useCompactMenu(compact: boolean) {
  const { pathname } = useLocation();
  const season = useChosenSeasonId();
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [pathname, compact, season]);
  useEffect(() => {
    if (!shown) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setShown(false);
    document.addEventListener("keydown", close);
    document.body.classList.add("no-scroll");
    // the page you are on is in sight, even far down the menu
    document.querySelector("#sidebar .nav-link.active")?.scrollIntoView({ block: "nearest" });
    return () => {
      document.removeEventListener("keydown", close);
      document.body.classList.remove("no-scroll");
    };
  }, [shown]);
  return [shown, setShown] as const;
}

/** Page frame: the navigation mirrors the tabs of the old sheet. */
export function Shell() {
  const compact = useMaxWidth(SCREEN.tablet);
  const [hidden, toggleSidebar] = useSidebarHidden();
  const [menuShown, setMenuShown] = useCompactMenu(compact);
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });
  const me = useMe();
  const queryClient = useQueryClient();
  // behind the organisation's login there is nothing to sign out of here
  const signInOptions = useQuery({ queryKey: ["sign-in-options"], queryFn: api.signInOptions });
  const { pathname } = useLocation();
  const season = useSeason();
  const chosenSeason = useChosenSeasonId();

  const signOut = async () => {
    await api.signOut();
    forgetUser(queryClient); // shows the sign-in page...
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" }); // ...and drops the data of this person
  };
  // the season is chosen in the menu; the bar of a phone only says which one it is
  const brand = (choice: boolean) => (
    <div className="brand-text">
      <strong>E-Agle TRT</strong>
      {choice ? <SeasonSwitcher /> : <span className="label-s muted">Budget {season?.name ?? ""}</span>}
    </div>
  );
  const frame = compact ? `shell compact${menuShown ? " menu-shown" : ""}` : `shell${hidden ? " collapsed" : ""}`;

  return (
    <div className={frame}>
      {compact && (
        <header className="topbar">
          {brand(false)}
          <button type="button" className="icon-btn burger" aria-label="Show the menu" aria-expanded={menuShown} aria-controls="sidebar" onClick={() => setMenuShown(true)}>
            <FontAwesomeIcon icon={faBars} />
          </button>
        </header>
      )}
      {!compact && hidden && (
        <button type="button" className="icon-btn menu-open" title="Show the menu" aria-label="Show the menu" aria-expanded={false} onClick={toggleSidebar}>
          <FontAwesomeIcon icon={faBars} />
        </button>
      )}
      {compact && menuShown && <div className="menu-backdrop" onClick={() => setMenuShown(false)} />}
      <aside className="sidebar" id="sidebar">
        <div className="brand">
          {brand(true)}
          {compact ? (
            <button type="button" className="icon-btn burger" aria-label="Close the menu" onClick={() => setMenuShown(false)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          ) : (
            <button type="button" className="icon-btn" title="Hide the menu" aria-label="Hide the menu" aria-expanded aria-controls="sidebar" onClick={toggleSidebar}>
              <FontAwesomeIcon icon={faAnglesLeft} />
            </button>
          )}
        </div>

        {/* the pages follow the order of the sheets of the Excel file (Budget 26-27), then the ones it does not have */}
        <NavGroup title="Budget">
          {areas.data?.map((area) => (
            <Item key={area.code} to={`/budget/${area.code}`} icon={faTable}>
              {area.name}
            </Item>
          ))}
        </NavGroup>

        <NavGroup title="Cash">
          <Item to="/cash-from" icon={faDatabase}>CASH FROM</Item>
          <Item to="/bought-from" icon={faTruckFast}>BOUGHT FROM</Item>
          <Item to="/cash-flow" icon={faRepeat}>CASH FLOW</Item>
        </NavGroup>

        {/* the money of the team: only the treasury and the admins see it */}
        {me.permissions.canManageCash && (
          <NavGroup title="Register">
            <Item to="/register" icon={faBookOpen}>REGISTRO DI CASSA</Item>
          </NavGroup>
        )}

        <NavGroup title="Views">
          <Item to="/gantt/estimate" icon={faChartLine}>EXPECTED GANTT</Item>
          <Item to="/gantt/actual" icon={faChartLine}>ACTUAL GANTT</Item>
          <Item to="/analysis/funds" icon={faSackDollar}>CASH FROM ANALYSES</Item>
          <Item to="/analysis/suppliers" icon={faTruckFast}>BOUGHT FROM ANALYSES</Item>
          <Item to="/analysis/items" icon={faMagnifyingGlass}>CATEGORY ANALYSES</Item>
        </NavGroup>

        {/* they choose their season, year or car on their own, whatever is chosen above */}
        <NavGroup title="Total">
          <Item to="/total/season" icon={faScaleBalanced}>SEASON TOTAL</Item>
          <Item to="/total/year" icon={faCalendarDays}>YEAR TOTAL</Item>
          <Item to="/total/car" icon={faCarSide}>CAR TOTAL</Item>
        </NavGroup>

        <NavGroup title="Inventory">
          <Item to="/inventory" icon={faBoxesStacked} end>INVENTORY</Item>
          <Item to="/inventory/pending" icon={faHourglassHalf}>PENDING</Item>
          <Item to="/inventory/components" icon={faPuzzlePiece}>COMPONENTS</Item>
          <Item to="/inventory/stats" icon={faChartPie}>INVENTORY STATS</Item>
        </NavGroup>

        {(me.permissions.canManageUsers || me.permissions.canViewHistory || me.permissions.canManageSettings || me.permissions.canManageInventory || me.permissions.canManageCash) && (
          <NavGroup title="Admin">
            {me.permissions.canManageUsers && <Item to="/users" icon={faUsers}>Users</Item>}
            {/* a project manager keeps the types of the inventory there, and only them */}
            {(me.permissions.canManageSettings || me.permissions.canManageInventory || me.permissions.canManageCash) && <Item to="/settings" icon={faSliders}>Settings</Item>}
            {me.permissions.canViewHistory && <Item to="/history" icon={faClockRotateLeft}>History</Item>}
          </NavGroup>
        )}

        <div className="sidebar-footer">
          <div className="who">
            <strong>{me.name}</strong>
            <span className="label-s muted">{me.role}</span>
          </div>
          {signInOptions.data?.proxy === false && <IconButton icon={faRightFromBracket} label="Sign out" onClick={signOut} />}
        </div>
      </aside>
      <main className="main">
        {/* the TOTAL pages do not follow the season of the menu: no strip there */}
        {!pathname.startsWith("/total/") && <SeasonStrip />}
        <ExportProvider>
          {/* one page per address and per season: the areas, items and components share a page, and without
              the key a form left open on one would still be open (and write) on the next, or in another season */}
          <Outlet key={`${chosenSeason ?? "today"}:${pathname}`} />
        </ExportProvider>
      </main>
    </div>
  );
}
