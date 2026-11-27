import { describe, expect, it } from "vitest";
import { emailFromHeader, nameFromEmail } from "./proxy";

describe("emailFromHeader", () => {
  it("reads one valid address, in lower case and without spaces around", () => {
    expect(emailFromHeader("Mario.Rossi@Team.Org")).toBe("mario.rossi@team.org");
    expect(emailFromHeader("  a@x.org ")).toBe("a@x.org");
  });

  it("refuses what is missing, empty, malformed or more than one address", () => {
    for (const value of [undefined, "", "   ", "not an email", "a@", "@x.org", "a@x.org, b@x.org", "a@x.org b@x.org", "<a@x.org>", `${"a".repeat(250)}@x.org`]) {
      expect([value, emailFromHeader(value)]).toEqual([value, null]);
    }
    expect(emailFromHeader(["a@x.org", "b@x.org"])).toBeNull();
  });
});

describe("nameFromEmail", () => {
  it("turns the part before the @ into capitalised words", () => {
    expect(nameFromEmail("mario.rossi@team.org")).toBe("Mario Rossi");
    expect(nameFromEmail("anna_maria-verdi@team.org")).toBe("Anna Maria Verdi");
    expect(nameFromEmail("mrossi2@team.org")).toBe("Mrossi2");
    expect(nameFromEmail("a+tag@team.org")).toBe("A Tag");
  });
});
