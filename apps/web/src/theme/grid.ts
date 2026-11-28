import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";

// AG Grid reads its look from the same design tokens as the rest of the app, so light and dark
// mode switch together (the values are CSS variables, resolved by the browser).
ModuleRegistry.registerModules([AllCommunityModule]);

export const gridTheme = themeQuartz.withParams({
  // AG Grid forces a light browser colour scheme by default, which paints its scrollbars white in
  // dark mode. "inherit" keeps the page's scheme, so they look like the scrollbars of the tables.
  browserColorScheme: "inherit",
  fontFamily: "var(--font)",
  fontSize: 13,
  // the grid is a sheet to type in: every cell has its lines, as in the tables (components.css, .data-table)
  backgroundColor: "var(--bg-null)",
  foregroundColor: "var(--text-strong)",
  headerBackgroundColor: "var(--bg-weak)",
  headerTextColor: "var(--text-sub)",
  headerFontWeight: 600,
  borderColor: "var(--stroke-sub)",
  oddRowBackgroundColor: "var(--bg-null)",
  rowHoverColor: "var(--bg-weak)",
  selectedRowBackgroundColor: "var(--bg-soft)",
  accentColor: "var(--secondary-default)",
  borderRadius: 4,
  wrapperBorderRadius: 6,
  spacing: 6,
  cellHorizontalPadding: 10,
  columnBorder: { style: "solid", width: 1, color: "var(--stroke-sub)" },
  headerColumnBorder: { style: "solid", width: 1, color: "var(--stroke-sub)" },
  rowBorder: { style: "solid", width: 1, color: "var(--stroke-sub)" },
  rowHeight: 34,
  headerHeight: 36,
  inputBorder: "1px solid var(--stroke-sub)",
  inputFocusBorder: "1px solid var(--secondary-default)",
  tooltipBackgroundColor: "var(--bg-null)",
  tooltipTextColor: "var(--text-strong)",
  tooltipBorder: "1px solid var(--stroke-sub)",
  dataFontSize: 13,
});
