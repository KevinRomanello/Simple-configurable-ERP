import {
  faChartLine, faDatabase, faMagnifyingGlass, faRepeat, faSackDollar, faScaleBalanced, faTable,
  faTruckFast,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { NavLink, Outlet } from "react-router";
import { api } from "../api/client";

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
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
