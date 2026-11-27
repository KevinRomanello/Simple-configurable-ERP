import { describe, expect, it } from "vitest";
import { loginProblem } from "./loginProblem";

describe("loginProblem", () => {
  it("shows nothing when there was no problem", () => {
    expect(loginProblem(null)).toBeNull();
  });

  it("words each code the server can send", () => {
    expect(loginProblem("cancelled")).toMatch(/cancelled/);
    expect(loginProblem("expired")).toMatch(/expired/);
    expect(loginProblem("deactivated")).toMatch(/deactivated/);
    expect(loginProblem("domain", "example.org")).toBe("Only @example.org accounts can sign in.");
    expect(loginProblem("domain")).toMatch(/team/);
  });

  it("never shows text taken from the address", () => {
    const crafted = "Your account is locked: call 555-0100";
    expect(loginProblem(crafted)).toBe("Sign-in failed: try again.");
    expect(loginProblem(crafted)).not.toContain("555");
  });
});
