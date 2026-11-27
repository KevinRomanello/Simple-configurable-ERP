import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ALL_ACTIVE, contracts, definePort } from "../../src/core/contracts";
import { ownerPool } from "../../src/db/owner";
import { loadSnapshot } from "../../src/snapshot";
import { ADMIN, cookieFor, createUser, resetData, testApp } from "../helpers";
import { buildSeason, SIZES } from "./dataset";

// How fast the server answers, on a season of a made-up size (`dataset.ts`). Run it with `pnpm bench` before and after a change of the
// structure of the server (docs/prestazioni.md): it prints, for each page that does real work, how long it takes and whether the answer is
// still the very same one. The numbers of the baseline are in `baseline.json`; `BENCH_SAVE=1` writes the ones of this run there.
// It runs only when asked (`BENCH=1`): the normal tests skip it.

const RUNS = 15;
const WARMUP = 3;
/** The day the benchmark pretends it is, so that what depends on today (days waiting, late inflows) is the same on every run. */
const TODAY = new Date("2026-11-26T12:00:00Z");

/** What is measured: a name that stays the same when the address moves (G4–G6 change the addresses) and the address of today. */
const PAGES: { name: string; url: string }[] = [
  { name: "me (every page starts here)", url: "/api/me" },
  { name: "core: seasons", url: "/api/seasons" },
  { name: "core: settings", url: "/api/settings" },
  { name: "core: users", url: "/api/users" },
  { name: "core: history", url: "/api/audit" },
  { name: "core: history of a table", url: "/api/audit?table=budget_line" },
  { name: "core: areas", url: "/api/areas" },
  { name: "core: categories", url: "/api/lookups/categories" },
  { name: "inventory: units", url: "/api/inventory/units" },
  { name: "inventory: places", url: "/api/inventory/locations" },
  { name: "core: settings of the calculation", url: "/api/lookups/settings" },
  { name: "budget: area sheet", url: "/api/areas/mt-dmt/sheet" },
  { name: "budget: funds", url: "/api/funds" },
  { name: "budget: CASH FLOW", url: "/api/views/cashflow" },
  { name: "budget: gantt expected", url: "/api/views/gantt?phase=estimate" },
  { name: "budget: gantt actual", url: "/api/views/gantt?phase=actual" },
  { name: "budget: TOTAL", url: "/api/views/totals" },
  { name: "budget: funds summary", url: "/api/views/funds-summary?phase=actual" },
  { name: "budget: analysis of the funds", url: "/api/views/analysis/funds" },
  { name: "budget: analysis of the suppliers", url: "/api/views/analysis/suppliers" },
  { name: "budget: items view", url: "/api/views/items" },
  { name: "budget: inflows", url: "/api/inflows?phase=estimate" },
  { name: "treasury: register", url: "/api/treasury/register?year=2026" },
  { name: "treasury: financial statement", url: "/api/treasury/statement?year=2026" },
  { name: "treasury×budget: TO PAY", url: "/api/treasury-budget/to-pay" },
  { name: "treasury×budget: payments to tie", url: "/api/treasury-budget/to-link" },
  { name: "treasury×budget: lines to pay", url: "/api/treasury-budget/payable-lines" },
  { name: "inventory: items", url: "/api/inventory/items" },
  { name: "inventory×budget: PENDING", url: "/api/inventory-budget/pending" },
  { name: "inventory: components", url: "/api/inventory/components" },
  { name: "inventory: statistics", url: "/api/inventory/stats" },
  { name: "inventory: lists of Settings", url: "/api/inventory/lists" },
];

interface Result {
  medianMs: number;
  p95Ms: number;
  minMs: number;
  bytes: number;
  /** A fingerprint of the answer: the same data must give the same one before and after a change of the code. */
  hash: string;
}
type Results = Record<string, Result>;

const ms = (n: number) => Math.round(n * 100) / 100;
function summarize(times: number[], body: string): Result {
  const sorted = [...times].sort((a, b) => a - b);
  return { medianMs: ms(sorted[Math.floor(sorted.length / 2)]!), p95Ms: ms(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!), minMs: ms(sorted[0]!), bytes: Buffer.byteLength(body), hash: createHash("sha1").update(body).digest("hex").slice(0, 10) };
}

/** The snapshot as text with each list of rows sorted: the database may give the rows of a query that has no ORDER BY in another order, and that is no change. */
const inAnyOrder = (snapshot: object) =>
  JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Array.isArray(value) ? value.map((row) => JSON.stringify(row)).sort() : value])));

/** Times `run`; `body` turns what it gave into the text that is fingerprinted (after the clock has stopped). */
async function measure<T>(run: () => Promise<T>, body: (value: T) => string): Promise<Result> {
  for (let i = 0; i < WARMUP; i++) await run();
  const times: number[] = [];
  const hashes = new Set<string>();
  let last = "";
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const value = await run();
    times.push(performance.now() - start);
    last = body(value);
    hashes.add(createHash("sha1").update(last).digest("hex"));
  }
  // an answer that is not the same twice on the same data cannot be compared: it is said, and the comparison skips it
  const result = summarize(times, last);
  return hashes.size === 1 ? result : { ...result, hash: "unstable" };
}

const FILE = new URL("./baseline.json", import.meta.url).pathname;
const baseline: Record<string, Results> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const now: Record<string, Results> = {};

const api = testApp();
let cookie = "";
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
  cookie = await cookieFor((await createUser(ADMIN)).id);
});
afterAll(async () => {
  vi.useRealTimers();
  await api.close();
  await ownerPool.end();
  if (process.env.BENCH_SAVE) writeFileSync(FILE, JSON.stringify({ ...baseline, ...now }, null, 2) + "\n");
});

const get = async (url: string) => {
  const reply = await api.app.inject({ method: "GET", url, headers: { cookie } });
  if (reply.statusCode !== 200) throw new Error(`${url} answered ${reply.statusCode}: ${reply.body.slice(0, 200)}`);
  return reply.body;
};

function report(scale: string, results: Results) {
  const old = baseline[scale] ?? {};
  const rows = Object.entries(results).map(([name, r]) => {
    const before = old[name];
    const change = !before ? "new" : before.medianMs === 0 ? "" : `${r.medianMs / before.medianMs >= 1 ? "+" : ""}${Math.round((r.medianMs / before.medianMs - 1) * 100)}%`;
    const same = !before ? "" : r.hash === "unstable" || before.hash === "unstable" ? "(unstable)" : r.hash === before.hash ? "same answer" : "DIFFERENT ANSWER";
    return `${name.padEnd(40)} ${String(r.medianMs).padStart(9)} ms  p95 ${String(r.p95Ms).padStart(9)}  ${String(Math.round(r.bytes / 1024)).padStart(6)} KB  ${change.padStart(6)}  ${same}`;
  });
  console.log(`\n=== ${scale} (${SIZES[scale]!.lines} lines, ${SIZES[scale]!.entries} movements, ${SIZES[scale]!.items} items) ===\n${rows.join("\n")}\n`);
}

describe.skipIf(!process.env.BENCH)("how fast the server answers", () => {
  for (const scale of (process.env.BENCH_SCALES ?? Object.keys(SIZES).join(",")).split(",")) {
    it(`on a season of size ${scale}`, async () => {
      await resetData();
      await buildSeason(SIZES[scale]!);
      const results: Results = {};
      // the calculation on its own: what every budget page does first
      results["calculation: snapshot of the season"] = await measure(() => loadSnapshot(), (snapshot) => inAnyOrder(snapshot));
      for (const page of PAGES) results[page.name] = await measure(() => get(page.url), (text) => text);
      now[scale] = results;
      report(scale, results);
      // the pages must at least answer something that is not nothing
      expect(results["budget: area sheet"]!.bytes).toBeGreaterThan(1000);
    }, 900_000);
  }

  it("what the contracts between the owners cost: a call is a loop over a few functions, not a request", async () => {
    const port = definePort<number, number>("bench", "budget", (n) => n);
    contracts.fill(port, "treasury-budget", (_tx, n) => n + 1);
    const tx = undefined as never;
    const calls = 200_000;
    const direct = (n: number) => n + 1;
    let sum = 0;
    let start = performance.now();
    for (let i = 0; i < calls; i++) sum += direct(i);
    const plain = ((performance.now() - start) / calls) * 1e6;
    start = performance.now();
    for (let i = 0; i < calls; i++) sum += await contracts.ask(port, ALL_ACTIVE, tx, i);
    const asked = ((performance.now() - start) / calls) * 1e6;
    console.log(`\ncontracts: a port answered in ${Math.round(asked)} ns per call (a plain call: ${Math.round(plain)} ns); a query of the database takes about 100000 ns or more\n`);
    expect(sum).toBeGreaterThan(0);
    // the cost that matters: well under what one query to the database costs (a tenth of a millisecond at the very least)
    expect(asked).toBeLessThan(20_000);
  });
});
