import { describe, expect, it } from "vitest";

// The site uses only the types of the registry's engine (docs/anagrafiche.md, §2): the values are worked out by
// the server, never again in the browser. And every table is the same one, so that all of them behave alike
// (resizable columns, docs/stile-interfaccia.md). Checked on the code of every page.

const files = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("the site and the engine of the registry", () => {
  it("imports only types from @erp/registry", () => {
    const runtime = Object.entries(files).filter(([, text]) => /^\s*import\s+(?!type\b)[^;]*from\s+"@erp\/registry"/m.test(text)).map(([path]) => path);
    expect(Object.keys(files).length).toBeGreaterThan(50);
    expect(runtime).toEqual([]);
  });

  it("draws every table with the Table of components/ui, so that all of them behave alike", () => {
    // the one table that is not a table of data: the little list inside the tooltip of a chart
    const allowed = ["../components/ui/Table.tsx", "../components/LineChart.tsx"];
    const own = Object.entries(files).filter(([path, text]) => !allowed.includes(path) && /<table[\s>]/.test(text)).map(([path]) => path);
    expect(own).toEqual([]);
  });

  it("draws every picture with Picture of components, so that a click on any of them opens the big one", () => {
    // the tiles of the map are not pictures to look at: they are the background of the map, drawn many at a time
    const own = Object.entries(files).filter(([path, text]) => path !== "../components/Picture.tsx" && /<img(?![^>]*\bmap-tile\b)/.test(text)).map(([path]) => path);
    expect(own).toEqual([]);
  });

  it("opens the form of an action on a row with RowAction, never in a row of its own or in a bare popup", () => {
    // the old ways: a table row of the class row-panel (or a FragmentRow that made one) with the form in it, and a Peek (the big
    // rectangle of the record of the registry) used as the popup of an action
    const under = Object.entries(files).filter(([, text]) => /\brow-panel\b|\bFragmentRow\b/.test(text)).map(([path]) => path);
    expect(under).toEqual([]);
    const allowed = ["../components/ui/Peek.tsx", "../components/ui/index.ts", "../pages/registry/RecordPanel.tsx"];
    const bare = Object.entries(files).filter(([path, text]) => !allowed.includes(path) && /<Peek\b/.test(text)).map(([path]) => path);
    expect(bare).toEqual([]);
  });

  it("moves rows with the handle, never with arrows: the order of a list is its drag handle (DataTable reorder, useDragOrder)", () => {
    // the arrows of sorting and of «open in a new tab» have other names (faSort…, faArrowUpRightFromSquare)
    const arrows = Object.entries(files).filter(([, text]) => /\bfaArrow(Up|Down)\b|"Move (up|down)"/.test(text)).map(([path]) => path);
    expect(arrows).toEqual([]);
  });
});
