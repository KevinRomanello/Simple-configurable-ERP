import { describe, expect, it } from "vitest";
import { givesBody, givesOf, hasMoney, type Gives } from "./gives";

describe("what a sponsor gives", () => {
  it("is the type of the sponsor, or a fund with no limit when it is one", () => {
    expect(givesOf({ type: "fund", unlimited: false })).toBe("fund");
    expect(givesOf({ type: "gift", unlimited: false })).toBe("gift");
    expect(givesOf({ type: "gift_vat", unlimited: false })).toBe("gift_vat");
    expect(givesOf({ type: "fund", unlimited: true })).toBe("unlimited");
  });

  it("is told to the server as a type and whether it has a limit", () => {
    expect(givesBody("unlimited")).toEqual({ type: "fund", unlimited: true });
    expect(givesBody("fund")).toEqual({ type: "fund", unlimited: false });
    expect(givesBody("gift")).toEqual({ type: "gift", unlimited: false });
  });

  it("comes back as it went: every choice reads the same after the server keeps it", () => {
    for (const gives of ["fund", "gift", "gift_vat", "unlimited"] as Gives[]) expect(givesOf(givesBody(gives))).toBe(gives);
  });

  it("has money to put in it only when it is a fund with a limit", () => {
    expect(hasMoney("fund")).toBe(true);
    for (const gives of ["gift", "gift_vat", "unlimited"] as Gives[]) expect(hasMoney(gives)).toBe(false);
  });
});
