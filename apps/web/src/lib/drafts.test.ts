import { describe, expect, it } from "vitest";
import { draftRules, draftStoreKey, dropAllDrafts, hasDraft, readDraft, removeDraft, sameValue, timeOf, writeDraft } from "./drafts";

/** A browser storage in memory; `blocked` throws like a private window does. */
function store(blocked = false) {
  const data = new Map<string, string>();
  const fail = () => {
    if (blocked) throw new Error("storage is blocked");
  };
  return {
    data,
    getItem: (k: string) => (fail(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (fail(), void data.set(k, v)),
    removeItem: (k: string) => (fail(), void data.delete(k)),
    key: (i: number) => (fail(), [...data.keys()][i] ?? null),
    get length() {
      fail();
      return data.size;
    },
  };
}

const NOW = 1_800_000_000_000;
const draft = (value: unknown, at = NOW, base: string | null = null) => ({ value, at, base });

describe("the drafts of the forms", () => {
  it("are asked for by the key of a form, or by the start of the keys of a kind of form", () => {
    const s = store();
    writeDraft(7, "registry:field:47:new", draft({ name: "Code" }), s);
    writeDraft(7, "registry:field:48:12", draft({ name: "Other table" }, NOW - 2 * draftRules().maxAgeMs), s);
    expect(hasDraft(7, "registry:field:47:new", NOW, s)).toBe(true);
    expect(hasDraft(7, "registry:field:47:*", NOW, s)).toBe(true);
    // another table, another person and an old draft do not count
    expect(hasDraft(7, "registry:field:48:*", NOW, s)).toBe(false);
    expect(hasDraft(8, "registry:field:47:*", NOW, s)).toBe(false);
    expect(hasDraft(7, "registry:webhook:47:*", NOW, s)).toBe(false);
    expect(hasDraft(7, "registry:field:47:*", NOW, store(true))).toBe(false);
  });

  it("are written, read and removed, each for its form", () => {
    const s = store();
    writeDraft(7, "new-line:3", draft({ item: "Sensor" }), s);
    writeDraft(7, "pay:1,2", draft({ on: "2026-11-26" }), s);
    expect(readDraft(7, "new-line:3", NOW, s)).toEqual(draft({ item: "Sensor" }));
    removeDraft(7, "new-line:3", s);
    expect(readDraft(7, "new-line:3", NOW, s)).toBeNull();
    expect(readDraft(7, "pay:1,2", NOW, s)).not.toBeNull();
  });

  it("belong to a person: another one on the same computer finds nothing", () => {
    const s = store();
    writeDraft(7, "new-sponsor", draft({ name: "Acme" }), s);
    expect(readDraft(8, "new-sponsor", NOW, s)).toBeNull();
    expect(draftStoreKey(7, "x")).not.toBe(draftStoreKey(8, "x"));
  });

  it("last a day: an older one is not read, and is thrown away", () => {
    const s = store();
    const day = draftRules().maxAgeMs;
    writeDraft(7, "a", draft(1, NOW - day + 1000), s);
    writeDraft(7, "b", draft(2, NOW - day - 1000), s);
    expect(readDraft(7, "a", NOW, s)).not.toBeNull();
    expect(readDraft(7, "b", NOW, s)).toBeNull();
    expect(s.data.has(draftStoreKey(7, "b"))).toBe(false);
  });

  it("all go at the logout, and nothing else of the browser does", () => {
    const s = store();
    writeDraft(7, "a", draft(1), s);
    writeDraft(8, "b", draft(2), s);
    s.setItem("erp.theme", "dark");
    s.setItem("erp.rowActionMode", "side");
    dropAllDrafts(s);
    expect([...s.data.keys()].sort()).toEqual(["erp.rowActionMode", "erp.theme"]);
  });

  it("do nothing, and break nothing, without the storage of the browser", () => {
    const s = store(true);
    expect(() => writeDraft(7, "a", draft(1), s)).not.toThrow();
    expect(readDraft(7, "a", NOW, s)).toBeNull();
    expect(() => removeDraft(7, "a", s)).not.toThrow();
    expect(() => dropAllDrafts(s)).not.toThrow();
  });

  it("ignore what is in the place of a draft and is not one", () => {
    const s = store();
    s.data.set(draftStoreKey(7, "a"), "not json");
    s.data.set(draftStoreKey(7, "b"), JSON.stringify({ value: 1 })); // no time
    expect(readDraft(7, "a", NOW, s)).toBeNull();
    expect(readDraft(7, "b", NOW, s)).toBeNull();
  });
});

describe("what a draft is compared with", () => {
  it("is the same when the values are the same, whatever the object", () => {
    expect(sameValue({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("is shown as the time of day it was kept from", () => {
    const at = new Date(2026, 10, 26, 9, 5).getTime();
    expect(timeOf(at)).toBe("09:05");
  });
});
