import {
  faChartLine, faClockRotateLeft, faDatabase, faMagnifyingGlass, faRepeat, faRightFromBracket, faSackDollar,
  faScaleBalanced, faTable, faTruckFast, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { NavLink, Outlet } from "react-router";
import { api } from "../api/client";
import { forgetUser, useMe } from "../lib/auth";
import { IconButton } from "./Button";

function Item({ to, icon, children }: { to: string; icon: IconDefinition; children: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <FontAwesomeIcon icon={icon} fixedWidth />
      {children}
    </NavLink>
  );
}

/** Page frame: the navigation mirrors the tabs of the old sheet. */
export function Shell() {
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });
  const me = useMe();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await api.signOut();
    forgetUser(queryClient); // shows the sign-in page...
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" }); // ...and drops the data of this person
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>E-Agle TRT</strong>
          <span className="label-s muted">Budget 2026-2027</span>
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
