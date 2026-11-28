import { Tabs } from "../../core/ui";

// The pages of the budget that are one view in several cuts: one entry of the menu each, and their cuts as the tabs of the page, each
// with its own address (the addresses are the ones of the sheet's pages, so links and bookmarks keep working).

export function GanttTabs() {
  return <Tabs label="Phase" tabs={[{ key: "estimate", label: "EXPECTED", to: "/gantt/estimate" }, { key: "actual", label: "ACTUAL", to: "/gantt/actual" }]} />;
}

export function AnalysisTabs() {
  return (
    <Tabs
      label="Analyses"
      tabs={[
        { key: "funds", label: "CASH FROM", to: "/analysis/funds" },
        { key: "suppliers", label: "BOUGHT FROM", to: "/analysis/suppliers" },
        { key: "items", label: "CATEGORY", to: "/analysis/items" },
      ]}
    />
  );
}

export function TotalTabs() {
  return (
    <Tabs
      label="Total"
      tabs={[
        { key: "season", label: "SEASON", to: "/total/season" },
        { key: "year", label: "YEAR", to: "/total/year" },
        { key: "car", label: "CAR", to: "/total/car" },
      ]}
    />
  );
}
