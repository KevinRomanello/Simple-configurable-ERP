import { faChartLine, faDatabase, faMagnifyingGlass, faRepeat, faScaleBalanced, faTable, faTruckFast } from "@fortawesome/free-solid-svg-icons";
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
    { path: "gantt", element: <Navigate to="/gantt/estimate" replace /> },
    { path: "gantt/:phase", element: <GanttPage /> },
    { path: "total", element: <Navigate to="/total/season" replace /> },
    { path: "total/season", element: <TotalPage kind="season" /> },
    { path: "total/year", element: <TotalPage kind="year" /> },
    { path: "total/car", element: <TotalPage kind="car" /> },
    { path: "analysis", element: <Navigate to="/analysis/funds" replace /> },
    { path: "analysis/funds", element: <AnalysisPage kind="funds" /> },
    { path: "analysis/suppliers", element: <AnalysisPage kind="suppliers" /> },
    { path: "analysis/items", element: <ItemsPage /> },
  ],
  menuGroups: [
    { id: "budget", title: "Budget", order: 10, paths: ["/budget/"] },
    // the views of the whole budget: one entry each, their cuts are the tabs of the page (TOTAL chooses its own season, year or car)
    { id: "views", title: "Views", order: 20, paths: ["/gantt/", "/analysis/", "/total/"] },
    // the money: the sponsors, the suppliers and the forecast
    { id: "cash", title: "Cash", order: 30, paths: ["/cash-from", "/bought-from", "/cash-flow"] },
  ],
  menu: [
    { group: "budget", order: 10, element: <AreaLinks /> },
    { group: "views", order: 10, element: <MenuLink to="/gantt" icon={faChartLine}>GANTT</MenuLink> },
    { group: "views", order: 20, element: <MenuLink to="/analysis" icon={faMagnifyingGlass}>ANALYSES</MenuLink> },
    { group: "views", order: 30, element: <MenuLink to="/total" icon={faScaleBalanced}>TOTAL</MenuLink> },
    { group: "cash", order: 10, element: <MenuLink to="/cash-from" icon={faDatabase}>CASH FROM</MenuLink> },
    { group: "cash", order: 20, element: <MenuLink to="/bought-from" icon={faTruckFast}>BOUGHT FROM</MenuLink> },
    { group: "cash", order: 30, element: <MenuLink to="/cash-flow" icon={faRepeat}>CASH FLOW</MenuLink> },
  ],
  settings: [{ key: "budget", label: "Budget", order: 10, allowed: (me) => me.permissions.canManageSettings, Content: BudgetSettings, shows: ["seasons", "vatRates"] }],
  home: () => <FirstArea />,
};
