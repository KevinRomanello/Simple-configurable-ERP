import { describe, expect, it } from "vitest";
import type { RelatedInflows, RelatedVoice } from "./types";
import { allVoices, deleteBody, registerWarning, startingTicks, tickAll, voiceKey } from "./inflowVoices";

const voice = (kind: RelatedVoice["kind"], id: number, change: Partial<RelatedVoice> = {}): RelatedVoice => ({
  kind, id, name: "Acme", amount: "100.00", date: "2026-12-01", received: false, receivedOn: null, counted: true, pressed: false, canDelete: true, why: null, ...change,
});

const related = (): RelatedInflows => ({
  expected: [voice("inflow", 1, { pressed: true }), voice("inflow", 2, { received: true, canDelete: false, why: "Only the treasury can delete a received inflow" })],
  actual: [voice("inflow", 3)],
  register: [voice("entry", 9)],
  registerHidden: 0,
});

describe("what is ticked in the panel that deletes an inflow", () => {
  it("is, to start with, only the row that was pressed", () => {
    expect([...startingTicks(related())]).toEqual(["inflow:1"]);
  });

  it("is nothing to start with when the pressed row cannot be deleted", () => {
    const r = related();
    r.expected[0] = voice("inflow", 1, { pressed: true, canDelete: false, why: "The season 2026-2027 is read-only" });
    expect(startingTicks(r).size).toBe(0);
  });

  it("is, with «Tick all», everything that can be deleted and nothing of what cannot", () => {
    expect([...tickAll(related())].sort()).toEqual(["entry:9", "inflow:1", "inflow:3"]);
  });

  it("keeps the inflows and the movements apart in what is sent, and never sends what cannot be deleted", () => {
    const r = related();
    expect(deleteBody(r, new Set(["inflow:1", "inflow:3", "entry:9"]))).toEqual({ inflowIds: [1, 3], cashEntryIds: [9] });
    // ticked by mistake (a stale panel): the voice that cannot be deleted does not go
    expect(deleteBody(r, new Set(["inflow:2"]))).toEqual({ inflowIds: [], cashEntryIds: [] });
    expect(deleteBody(r, new Set())).toEqual({ inflowIds: [], cashEntryIds: [] });
  });

  it("warns about the movements of the register, only when one is ticked", () => {
    const r = related();
    expect(registerWarning(r, new Set(["inflow:1"]))).toBeNull();
    expect(registerWarning(r, new Set(["entry:9"]))).toBe("1 movement of the register will be deleted: the balances of the register change.");
    r.register.push(voice("entry", 10));
    expect(registerWarning(r, new Set(["entry:9", "entry:10"]))).toMatch(/^2 movements of the register/);
  });

  it("gives every voice its own key, an inflow and a movement with the same number apart", () => {
    expect(voiceKey({ kind: "inflow", id: 4 })).not.toBe(voiceKey({ kind: "entry", id: 4 }));
    expect(allVoices(related()).map(voiceKey)).toEqual(["inflow:1", "inflow:2", "inflow:3", "entry:9"]);
  });
});
