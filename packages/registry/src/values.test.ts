import { describe, expect, it } from "vitest";
import { field } from "./testing";
import { fieldNameProblem, fromText, isDay, normalizeValue, textOf } from "./values";

const keep = (f: ReturnType<typeof field>, raw: unknown) => {
  const result = normalizeValue(f, raw);
  return result.ok ? result.value : `ERROR: ${result.error}`;
};

describe("values", () => {
  it("clean texts the way the team's automations did", () => {
    expect(keep(field(1, "Name", "text", { transform: "title" }), "  mario de rossi ")).toBe("Mario De Rossi");
    expect(keep(field(1, "Name", "text", { transform: "title" }), "D'ANGELO")).toBe("D'Angelo");
    expect(keep(field(1, "Email", "email"), " Mario.Rossi@Uni.TEST ")).toBe("mario.rossi@uni.test");
    expect(keep(field(1, "Phone", "phone", { defaultPrefix: "+39" }), "333 123 45 67")).toBe("+393331234567");
    expect(keep(field(1, "Phone", "phone", { defaultPrefix: "+39" }), "0044 (20) 7946-0958")).toBe("+442079460958");
    expect(keep(field(1, "Line", "text"), "one\ntwo")).toBe("one two");
  });

  it("refuse what does not fit, saying which field and why", () => {
    expect(keep(field(1, "Email", "email"), "nope")).toBe("ERROR: Email: not a valid email address");
    expect(keep(field(1, "Site", "url"), "javascript:alert(1)")).toContain("not a valid address");
    expect(keep(field(1, "Short", "text", { maxLength: 3 }), "abcd")).toBe("ERROR: Short: at most 3 characters");
    expect(keep(field(1, "Age", "number", { min: 0, max: 120 }), 200)).toBe("ERROR: Age: at most 120");
    expect(keep(field(1, "Stars", "rating", { max: 5 }), 6)).toContain("from 0 to 5");
    expect(keep(field(1, "Born", "date"), "2026-02-30")).toContain("not a valid date");
    expect(keep(field(1, "Formula", "formula"), "x")).toContain("is worked out");
    expect(keep(field(1, "Text", "text"), "a\u0000b")).toContain("expected a text");
  });

  it("keep numbers to the decimals of the field, and accept a decimal comma", () => {
    expect(keep(field(1, "N", "number"), "12.6")).toBe(13);
    expect(keep(field(1, "N", "number", { precision: 2 }), "12,345")).toBe(12.35);
    expect(keep(field(1, "N", "number", { precision: 2 }), -1.005)).toBe(-1.01);
  });

  it("take the choices with their own spelling", () => {
    const state = field(1, "State", "select", { choices: [{ name: "In trial" }, { name: "Active Member" }] });
    expect(keep(state, "in TRIAL")).toBe("In trial");
    expect(keep(state, "Other")).toContain("not one of the choices");
    const skills = field(1, "Skills", "multiselect", { choices: [{ name: "C" }, { name: "Python" }] });
    expect(keep(skills, ["python", "C", "Python"])).toEqual(["Python", "C"]);
  });

  it("read yes and no in many ways, and empty as no", () => {
    const box = field(1, "Paid", "checkbox");
    expect(keep(box, "Sì")).toBe(true);
    expect(keep(box, "x")).toBe(true);
    expect(keep(box, "no")).toBe(false);
    expect(keep(box, null)).toBe(false);
    expect(keep(box, "maybe")).toContain("expected yes or no");
  });

  it("take links and files as lists of ids, one only when the link is single", () => {
    expect(keep(field(1, "Area", "link", { tableId: 2, multiple: true }), [3, { id: 4 }, "5", 3])).toEqual([3, 4, 5]);
    expect(keep(field(1, "Area", "link", { tableId: 2, multiple: false }), [3, 4])).toContain("only one record");
    expect(keep(field(1, "Area", "link", { tableId: 2 }), ["x"])).toContain("expected the ids");
    expect(keep(field(1, "CV", "attachment", { maxFiles: 1 }), [1, 2])).toContain("at most 1 files");
  });

  it("make empty input null, whatever the type", () => {
    for (const type of ["text", "email", "number", "date", "select", "link", "json"] as const) expect(keep(field(1, "X", type), " ")).toBeNull();
  });

  it("dates and times stay within 1900 and 2200, birth dates included", () => {
    expect(isDay("1999-07-05")).toBe(true);
    expect(isDay("1800-01-01")).toBe(false);
    expect(keep(field(1, "At", "datetime"), "2026-11-21T10:00:00+01:00")).toBe("2026-11-21T09:00:00.000Z");
  });

  it("read the text of a CSV cell", () => {
    expect(fromText("date", "5/7/1999")).toBe("1999-07-05");
    expect(fromText("number", "3,5")).toBe("3.5");
    expect(fromText("multiselect", "C, Python ,")).toEqual(["C", "Python"]);
    expect(fromText("json", '{"a":1}')).toEqual({ a: 1 });
    expect(textOf([{ id: 1, name: "SW" }, { id: 2, name: "HW" }])).toBe("SW, HW");
    expect(textOf(true)).toBe("true");
  });

  it("field names cannot hold braces nor look like ids", () => {
    expect(fieldNameProblem("{x}")).toContain("{ or }");
    expect(fieldNameProblem("#12")).toContain("id");
    expect(fieldNameProblem("  ")).toContain("needs a name");
    expect(fieldNameProblem("Full Name")).toBeNull();
  });
});
