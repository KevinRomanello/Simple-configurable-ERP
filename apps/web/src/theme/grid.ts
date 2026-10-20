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
  backgroundColor: "var(--bg-weak)",
  foregroundColor: "var(--text-strong)",
  headerBackgroundColor: "var(--bg-soft)",
  headerTextColor: "var(--text-strong)",
  headerFontWeight: 700,
  borderColor: "var(--stroke-sub)",
  oddRowBackgroundColor: "var(--bg-weak)",
  rowHoverColor: "var(--bg-soft)",
  selectedRowBackgroundColor: "var(--bg-sub)",
  accentColor: "var(--secondary-default)",
  borderRadius: 2,
  wrapperBorderRadius: 2,
  spacing: 6,
  rowHeight: 32,
  headerHeight: 32,
  inputBorder: "1px solid var(--stroke-sub)",
  dataFontSize: 13,
});
