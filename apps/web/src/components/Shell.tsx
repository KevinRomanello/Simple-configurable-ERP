import {
  faAnglesLeft, faBars, faBoxesStacked, faChartLine, faChartPie, faClockRotateLeft, faDatabase, faHourglassHalf, faMagnifyingGlass, faPuzzlePiece, faRepeat, faRightFromBracket, faSackDollar,
  faScaleBalanced, faTable, faTruckFast, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { api } from "../api/client";
import { forgetUser, useMe } from "../lib/auth";
import { IconButton } from "./Button";

/** `end`: the link is lit only for its own page, not for the pages below it (INVENTORY next to PENDING). */
function Item({ to, icon, end, children }: { to: string; icon: IconDefinition; end?: boolean; children: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <FontAwesomeIcon icon={icon} fixedWidth />
      {children}
    </NavLink>
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

/** Page frame: the navigation mirrors the tabs of the old sheet. */
export function Shell() {
  const [hidden, toggleSidebar] = useSidebarHidden();
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });
  const me = useMe();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await api.signOut();
    forgetUser(queryClient); // shows the sign-in page...
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" }); // ...and drops the data of this person
  };

  return (
    <div className={`shell${hidden ? " collapsed" : ""}`}>
      {hidden && (
        <button type="button" className="icon-btn menu-open" title="Show the menu" aria-label="Show the menu" aria-expanded={false} onClick={toggleSidebar}>
          <FontAwesomeIcon icon={faBars} />
        </button>
      )}
      <aside className="sidebar" id="sidebar">
        <div className="brand">
          <div className="brand-text">
            <strong>E-Agle TRT</strong>
            <span className="label-s muted">Budget 2026-2027</span>
          </div>
          <button type="button" className="icon-btn" title="Hide the menu" aria-label="Hide the menu" aria-expanded aria-controls="sidebar" onClick={toggleSidebar}>
            <FontAwesomeIcon icon={faAnglesLeft} />
          </button>
        </div>

        <nav className="nav-group">
          <span className="nav-title label-xs bold">Budget</span>
          {areas.data?.map((area) => (
            <Item key={area.code} to={`/budget/${area.code}`} icon={faTable}>
              {area.name}
            </Item>
          ))}
        </nav>

        <nav className="nav-group">
          <span className="nav-title label-xs bold">Cash</span>
          <Item to="/cash-from" icon={faDatabase}>CASH FROM</Item>
          <Item to="/bought-from" icon={faTruckFast}>BOUGHT FROM</Item>
          <Item to="/cash-flow" icon={faRepeat}>CASH FLOW</Item>
        </nav>

        <nav className="nav-group">
          <span className="nav-title label-xs bold">Views</span>
          <Item to="/gantt/estimate" icon={faChartLine}>EXPECTED GANTT</Item>
          <Item to="/gantt/actual" icon={faChartLine}>ACTUAL GANTT</Item>
          <Item to="/total" icon={faScaleBalanced}>TOTAL</Item>
          <Item to="/analysis/funds" icon={faSackDollar}>CASH FROM ANALYSES</Item>
          <Item to="/analysis/suppliers" icon={faTruckFast}>BOUGHT FROM ANALYSES</Item>
          <Item to="/analysis/items" icon={faMagnifyingGlass}>CATEGORY ANALYSES</Item>
        </nav>

        <nav className="nav-group">
          <span className="nav-title label-xs bold">Inventory</span>
          <Item to="/inventory" icon={faBoxesStacked} end>INVENTORY</Item>
          <Item to="/inventory/pending" icon={faHourglassHalf}>PENDING</Item>
          <Item to="/inventory/components" icon={faPuzzlePiece}>COMPONENTS</Item>
          <Item to="/inventory/stats" icon={faChartPie}>INVENTORY STATS</Item>
        </nav>

        {(me.permissions.canManageUsers || me.permissions.canViewHistory) && (
          <nav className="nav-group">
            <span className="nav-title label-xs bold">Admin</span>
            {me.permissions.canManageUsers && <Item to="/users" icon={faUsers}>Users</Item>}
            {me.permissions.canViewHistory && <Item to="/history" icon={faClockRotateLeft}>History</Item>}
          </nav>
        )}

        <div className="sidebar-footer">
          <div className="who">
            <strong>{me.name}</strong>
            <span className="label-s muted">{me.role}</span>
          </div>
          <IconButton icon={faRightFromBracket} label="Sign out" onClick={signOut} />
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
