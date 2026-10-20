import { describe, expect, it } from "vitest";
import { figures, line, snapshot } from "./fixtures";
import { vatReport } from "./vatReport";

// Team's fund is id 1, so every line below leaves 22% VAT to the team.
const team = { fundId: 1 };
const withProject = (lines: ReturnType<typeof line>[]) =>
  snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    lines,
  });

describe("vatReport", () => {
  it("covers the default horizon with the six quarterly deadlines", () => {
    const report = vatReport(withProject([]), "mt-dmt");
    expect(report.deadlines).toEqual([
      "2026-11-16",
      "2027-02-16",
      "2027-05-17", // 16 May 2027 is a Sunday
      "2027-08-20",
      "2027-11-16",
      "2028-02-16",
    ]);
  });

  it("adds the VAT of each line to the deadline of its purchase quarter", () => {
    const report = vatReport(
      withProject([
        line(1, 1, figures(10, 100, { ...team, purchaseDate: "2026-11-10" }), figures(1, 100, { ...team, purchaseDate: "2026-11-12" })),
        line(2, 1, figures(1, 100, { ...team, purchaseDate: "2026-12-01" })),
      ]),
      "mt-dmt",
    );
    const project = report.projects[0]!;
    expect(project.estimateCents).toEqual([0, 22_000 + 2_200, 0, 0, 0, 0]);
    expect(project.actualCents).toEqual([0, 2_200, 0, 0, 0, 0]);
  });

  it("widens the horizon to a purchase made before it starts", () => {
    const report = vatReport(
      withProject([line(1, 1, figures(1, 100, { ...team, purchaseDate: "2026-05-10" }))]),
      "mt-dmt",
    );
    expect(report.deadlines[0]).toBe("2026-08-20"); // Q2 2026
    expect(report.deadlines).toHaveLength(7);
    expect(report.projects[0]!.estimateCents[0]).toBe(2_200);
  });

  it("widens the horizon after its end too", () => {
    const report = vatReport(
      withProject([line(1, 1, figures(1, 100, { ...team, purchaseDate: "2028-01-10" }))]),
      "mt-dmt",
    );
    expect(report.deadlines.at(-1)).toBe("2028-05-16"); // Q1 2028
  });

  it("ignores lines of other areas", () => {
    const s = snapshot({
      projects: [
        { id: 1, areaId: 1, name: "P", ownerName: null, position: 1 },
        { id: 2, areaId: 2, name: "Q", ownerName: null, position: 1 },
      ],
      lines: [line(1, 2, figures(1, 100, { ...team, purchaseDate: "2026-11-10" }))],
    });
    expect(vatReport(s, "mt-dmt").projects.map((p) => p.name)).toEqual(["P"]);
    expect(vatReport(s, "mt-dmt").projects[0]!.estimateCents.every((c) => c === 0)).toBe(true);
  });
});
