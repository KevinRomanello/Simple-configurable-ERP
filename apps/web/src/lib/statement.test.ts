import { describe, expect, it } from "vitest";
import type { StatementIssue } from "../api/types";
import { issueText } from "./statement";

const issue = (over: Partial<StatementIssue>): StatementIssue => ({ kind: "paypalLeftOut", row: 2, label: "1. QUOTE", count: 2, cents: -123_456, ...over });

describe("issueText", () => {
  it("names the Voce the statement has no row for, and says how many movements and how much money are not counted", () => {
    const text = issueText(issue({ kind: "unknownVoce", row: null, label: "9.4 Pec", count: 1, cents: -2_500 }));
    expect(text.title).toBe("Voce “9.4 Pec”");
    expect(text.now).toContain("1 movement, -25,00");
    expect(text.now).toContain("Not counted");
  });

  it("tells the movements with no Voce to the person who can fix them", () => {
    expect(issueText(issue({ kind: "noVoce", row: null, label: "", count: 3, cents: 100 })).now).toContain("3 movements, 1,00");
    expect(issueText(issue({ kind: "noVoce", row: null, label: "", count: 3, cents: 100 })).now).toContain("CASH REGISTER");
  });

  it("says what each rule of the table is, with the label of its row as the title", () => {
    for (const kind of ["paypalLeftOut", "outsideTotals", "sectionInSection", "wrongSign"] as const) {
      const text = issueText(issue({ kind }));
      expect(text.title).toBe("1. QUOTE");
      expect(text.what.length).toBeGreaterThan(20);
      expect(text.now).toContain("2 movements");
    }
  });
});
