import { describe, expect, it } from "vitest";
import { activeOwners, ALL_ACTIVE, createContracts, defineDeclaration, defineEvent, definePort, defineQuestion } from "./contracts";
import type { Tx } from "./tx";

// The contracts between the owners of the server (docs/moduli-architettura.md, §5). No database is needed: `tx` is only passed along.
const tx = { id: "the transaction" } as unknown as Tx;
const BRIDGES = { "treasury-budget": ["treasury", "budget"], "registry-access": ["registry"] };

describe("who is on", () => {
  it("is everybody when nothing is turned off", () => {
    expect(activeOwners([], BRIDGES)).toBe(ALL_ACTIVE);
    expect(ALL_ACTIVE.has("anything")).toBe(true);
  });

  it("leaves out a module that is off and every bridge that needs it, and nothing else", () => {
    const active = activeOwners(["budget"], BRIDGES);
    expect(["budget", "treasury-budget"].map((o) => active.has(o))).toEqual([false, false]);
    expect(["treasury", "registry", "registry-access", "platform"].map((o) => active.has(o))).toEqual([true, true, true, true]);
    expect(activeOwners(["registry"], BRIDGES).has("registry-access")).toBe(false);
  });
});

describe("events", () => {
  const seasonCreated = defineEvent<{ name: string }>("seasonCreated", "data");
  const exported = defineEvent<string>("exported", "feature");

  it("reach the listeners in the order they registered, in the same transaction, one after the other", async () => {
    const c = createContracts();
    const seen: string[] = [];
    c.on(seasonCreated, "budget", async (t, s) => {
      await Promise.resolve();
      seen.push(`budget:${s.name}:${t === tx}`);
    });
    c.on(seasonCreated, "inventory", (t, s) => void seen.push(`inventory:${s.name}:${t === tx}`));
    await c.emit(seasonCreated, ALL_ACTIVE, tx, { name: "2027-2028" });
    expect(seen).toEqual(["budget:2027-2028:true", "inventory:2027-2028:true"]);
  });

  it("skip the owners that are off when they are a feature, and reach them when they keep the data in order", async () => {
    const c = createContracts();
    const seen: string[] = [];
    for (const [event, label] of [[seasonCreated, "data"], [exported, "feature"]] as const) {
      c.on(event as never, "budget", () => void seen.push(`budget:${label}`));
      c.on(event as never, "inventory", () => void seen.push(`inventory:${label}`));
    }
    const budgetOff = activeOwners(["budget"], BRIDGES);
    await c.emit(seasonCreated, budgetOff, tx, { name: "x" });
    await c.emit(exported, budgetOff, tx, "x");
    expect(seen).toEqual(["budget:data", "inventory:data", "inventory:feature"]);
  });

  it("let a listener refuse: the error stops the rest and goes back to who sent the event", async () => {
    const c = createContracts();
    const seen: string[] = [];
    c.on(exported, "treasury", () => {
      throw new Error("The season is read-only");
    });
    c.on(exported, "inventory", () => void seen.push("inventory"));
    await expect(c.emit(exported, ALL_ACTIVE, tx, "x")).rejects.toThrow("The season is read-only");
    expect(seen).toEqual([]);
  });

  it("with nobody listening are nothing", async () => {
    await expect(createContracts().emit(exported, ALL_ACTIVE, tx, "x")).resolves.toBeUndefined();
  });
});

describe("questions", () => {
  const usedBy = defineQuestion<string, { label: string; count: number }>("usedBy", "feature");

  it("collect what each owner that is on answers, in the order they registered", async () => {
    const c = createContracts();
    c.answer(usedBy, "budget", (_t, name) => ({ label: "budget lines", count: name.length }));
    c.answer(usedBy, "inventory", () => ({ label: "items", count: 3 }));
    expect(await c.collect(usedBy, ALL_ACTIVE, tx, "Sensors")).toEqual([{ label: "budget lines", count: 7 }, { label: "items", count: 3 }]);
    expect(await c.collect(usedBy, activeOwners(["budget"], BRIDGES), tx, "Sensors")).toEqual([{ label: "items", count: 3 }]);
  });
});

describe("ports", () => {
  const payments = definePort<number[], Record<number, number>>("payments", "budget", (lines) => Object.fromEntries(lines.map((id) => [id, 0])));

  it("give the plain answer when nobody fills them", async () => {
    expect(await createContracts().ask(payments, ALL_ACTIVE, tx, [1, 2])).toEqual({ 1: 0, 2: 0 });
  });

  it("give the answer of the bridge that fills them, and the plain one when the bridge is off", async () => {
    const c = createContracts();
    c.fill(payments, "treasury-budget", (t, lines) => Object.fromEntries(lines.map((id) => [id, t === tx ? id * 100 : -1])));
    expect(await c.ask(payments, ALL_ACTIVE, tx, [1, 2])).toEqual({ 1: 100, 2: 200 });
    expect(await c.ask(payments, activeOwners(["treasury"], BRIDGES), tx, [1, 2])).toEqual({ 1: 0, 2: 0 });
  });

  it("have one answer: a second one is a mistake that shows at the start", () => {
    const c = createContracts();
    c.fill(payments, "treasury-budget", () => ({}));
    expect(() => c.fill(payments, "someone-else", () => ({}))).toThrow("already filled by treasury-budget");
  });
});

describe("declarations", () => {
  const flag = defineDeclaration<{ key: string; label: string }>("flag");

  it("are gathered from the owners that are on, in the order they were declared", () => {
    const c = createContracts();
    c.declare(flag, "treasury", { key: "treasury", label: "Treasury" });
    c.declare(flag, "budget", { key: "sponsors", label: "Sponsors" });
    expect(c.declared(flag, ALL_ACTIVE).map((f) => f.key)).toEqual(["treasury", "sponsors"]);
    expect(c.declared(flag, activeOwners(["treasury"], BRIDGES)).map((f) => f.key)).toEqual(["sponsors"]);
    expect(c.declared(defineDeclaration("nothing"), ALL_ACTIVE)).toEqual([]);
  });
});
