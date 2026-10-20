import { describe, expect, it } from "vitest";
import { errorMessage } from "./client";

describe("errorMessage", () => {
  it("names the field and the reason for input that failed validation", () => {
    const payload = {
      error: "Invalid input",
      issues: [{ path: ["figures", "estimate", "quantity"], message: "The value cannot be more than 1,000,000" }],
    };
    expect(errorMessage(payload, "Bad Request")).toBe("figures.estimate.quantity: The value cannot be more than 1,000,000");
  });

  it("leaves out the field when the problem is the whole body", () => {
    expect(errorMessage({ error: "Invalid input", issues: [{ path: [], message: "Expected object" }] }, "x")).toBe("Expected object");
  });

  it("uses the server's sentence for every other refusal", () => {
    expect(errorMessage({ error: "This line was changed by someone else: reload it and try again" }, "Conflict")).toMatch(/changed by someone else/);
  });

  it("falls back to the HTTP status text when the answer is not what we expect", () => {
    expect(errorMessage(null, "Bad Gateway")).toBe("Bad Gateway");
    expect(errorMessage("<html>", "Bad Gateway")).toBe("Bad Gateway");
    expect(errorMessage({ error: 5 }, "Bad Gateway")).toBe("Bad Gateway");
  });
});
