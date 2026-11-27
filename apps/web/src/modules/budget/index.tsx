import {
  faCalendarDays, faCarSide, faChartLine, faDatabase, faMagnifyingGlass, faRepeat, faSackDollar, faScaleBalanced, faTable, faTruckFast,
} from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { platformApi } from "../../platform/api";
import { MenuLink, type Manifest } from "../../platform/manifest";
import { AnalysisPage } from "./AnalysisPage";
import { AreaPage } from "./AreaPage";
import { BudgetSettings } from "./BudgetSettings";
import { CashFlowPage } from "./CashFlowPage";
import { FundsPage } from "./FundsPage";
import { GanttPage } from "./GanttPage";
import { ItemsPage } from "./ItemsPage";
import { SuppliersPage } from "./SuppliersPage";
import { TotalPage } from "./TotalPage";

/** A page per area. The derived area (what is outside the budget) has none: it is a row of TOTAL, the Gantt and the analyses. */
function AreaLinks() {
  const areas = useQuery({ queryKey: ["areas"], queryFn: platformApi.areas });
  return (
    <>
      {areas.data?.filter((area) => !area.derived).map((area) => (
        <MenuLink key={area.code} to={`/budget/${area.code}`} icon={faTable}>
          {area.name}
        </MenuLink>
      ))}
    </>
  );
}

/** The first page of the budget: its first area, as the menu lists them. */
function FirstArea() {
  const areas = useQuery({ queryKey: ["areas"], queryFn: platformApi.areas });
  if (!areas.data) return null;
  const first = areas.data.find((area) => !area.derived);
  return <Navigate to={first ? `/budget/${first.code}` : "/settings"} replace />;
}

/** The budget (docs/moduli-architettura.md, §7.2): the pages of the areas, the money, the views, TOTAL, and its section of Settings. */
export const budgetManifest: Manifest = {
  key: "budget",
  routes: [
    { path: "budget/:code", element: <AreaPage /> },
    { path: "cash-from", element: <FundsPage /> },
    { path: "bought-from", element: <SuppliersPage /> },
    { path: "cash-flow", element: <CashFlowPage /> },
    { path: "gantt/:phase", element: <GanttPage /> },
    { path: "total", element: <Navigate to="/total/season" replace /> },
    { path: "total/season", element: <TotalPage kind="season" /> },
    { path: "total/year", element: <TotalPage kind="year" /> },
    { path: "total/car", element: <TotalPage kind="car" /> },
    { path: "analysis/funds", element: <AnalysisPage kind="funds" /> },
    { path: "analysis/suppliers", element: <AnalysisPage kind="suppliers" /> },
    { path: "analysis/items", element: <ItemsPage /> },
  ],
  menuGroups: [
    { id: "budget", title: "Budget", order: 10, paths: ["/budget/"] },
    { id: "views", title: "Views", order: 20, paths: ["/gantt/", "/analysis/"] },
    // the money: the sponsors, the suppliers and the forecast
    { id: "cash", title: "Cash", order: 30, paths: ["/cash-from", "/bought-from", "/cash-flow"] },
    // they choose their season, year or car on their own, whatever is chosen above
    { id: "total", title: "Total", order: 50, paths: ["/total/"] },
  ],
  menu: [
    { group: "budget", order: 10, element: <AreaLinks /> },
    { group: "views", order: 10, element: <MenuLink to="/gantt/estimate" icon={faChartLine}>EXPECTED GANTT</MenuLink> },
    { group: "views", order: 20, element: <MenuLink to="/gantt/actual" icon={faChartLine}>ACTUAL GANTT</MenuLink> },
    { group: "views", order: 30, element: <MenuLink to="/analysis/funds" icon={faSackDollar}>CASH FROM ANALYSES</MenuLink> },
    { group: "views", order: 40, element: <MenuLink to="/analysis/suppliers" icon={faTruckFast}>BOUGHT FROM ANALYSES</MenuLink> },
    { group: "views", order: 50, element: <MenuLink to="/analysis/items" icon={faMagnifyingGlass}>CATEGORY ANALYSES</MenuLink> },
    { group: "cash", order: 10, element: <MenuLink to="/cash-from" icon={faDatabase}>CASH FROM</MenuLink> },
    { group: "cash", order: 20, element: <MenuLink to="/bought-from" icon={faTruckFast}>BOUGHT FROM</MenuLink> },
    { group: "cash", order: 30, element: <MenuLink to="/cash-flow" icon={faRepeat}>CASH FLOW</MenuLink> },
    { group: "total", order: 10, element: <MenuLink to="/total/season" icon={faScaleBalanced}>SEASON TOTAL</MenuLink> },
    { group: "total", order: 20, element: <MenuLink to="/total/year" icon={faCalendarDays}>YEAR TOTAL</MenuLink> },
    { group: "total", order: 30, element: <MenuLink to="/total/car" icon={faCarSide}>CAR TOTAL</MenuLink> },
  ],
  settings: [{ key: "budget", label: "Budget", order: 10, allowed: (me) => me.permissions.canManageSettings, Content: BudgetSettings, shows: ["seasons", "vatRates"] }],
  home: () => <FirstArea />,
};
