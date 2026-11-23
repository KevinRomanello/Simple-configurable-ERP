import { describe, expect, it } from "vitest";
import { evaluateFormula, FormulaError, parseFormula, showExpression, storeExpression, type FormulaValue } from "./formula";

const env = { today: "2026-11-21", now: "2026-11-21T09:30:00.000Z" };
const run = (src: string, refs: Record<string, FormulaValue> = {}) => evaluateFormula(parseFormula(src), (r) => refs[r] ?? null, env);

describe("formulas", () => {
  it("work out the formulas the team uses in NocoDB", () => {
    expect(run('CONCAT({Name}, " ", {Surname})', { Name: "Anna", Surname: "Bianchi" })).toBe("Anna Bianchi");
    const email = "anna.bianchi@uni.test";
    expect(run('CONCAT(LEFT({Email}, SEARCH({Email}, "@")), "eagletrt.it")', { Email: email })).toBe("anna.bianchi@eagletrt.it");
    expect(run("FLOOR(AVG({D}, {E}, {S}, {A}))", { D: 8, E: 7, S: 6, A: 6 })).toBe(6);
    expect(run('DATEADD({Date}, {Days}, "day")', { Date: "2026-01-10", Days: 1825 })).toBe("2031-01-09");
    expect(run('IF(ISBLANK({File}), "Missing digital copy", IF(({Paid} != TRUE()), "Not paid", "OK"))', { File: null, Paid: false })).toBe("Missing digital copy");
    expect(run('IF(ISBLANK({File}), "Missing", IF(({Paid} != TRUE()), "Not paid", "OK"))', { File: ["a.pdf"], Paid: true })).toBe("OK");
  });

  it("know arithmetic, text joining and comparisons, with the usual precedence", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("-2 + 5")).toBe(3);
    expect(run("0.1 + 0.2")).toBe(0.3);
    expect(run('"a" & 1 & "b"')).toBe("a1b");
    expect(run("3 > 2")).toBe(true);
    expect(run('"b" <> "b"')).toBe(false);
    expect(run("{X} * 2", { X: "4,5" })).toBe(9);
  });

  it("treat empty values as 0 in sums and as nothing in texts", () => {
    expect(run("{A} + 1")).toBe(1);
    expect(run('CONCAT({A}, "x")')).toBe("x");
    expect(run("ISBLANK({A})")).toBe(true);
    expect(run("AVG({A}, {B})", { A: 4 })).toBe(4);
  });

  it("work with the lists of lookups", () => {
    expect(run("ARRAYJOIN({Tags})", { Tags: ["SW", "HW"] })).toBe("SW, HW");
    expect(run('ARRAYJOIN({Tags}, " / ")', { Tags: ["SW", "HW"] })).toBe("SW / HW");
    expect(run("SUM({Values})", { Values: [1, 2, 3] })).toBe(6);
    expect(run("MAX({Values}, 10)", { Values: [1, 20] })).toBe(20);
  });

  it("know dates: today, differences, parts, months that end early", () => {
    expect(run("TODAY()")).toBe("2026-11-21");
    expect(run('DATETIME_DIFF(TODAY(), {Start}, "day")', { Start: "2026-10-21" })).toBe(31);
    expect(run('DATETIME_DIFF(TODAY(), {Start}, "month")', { Start: "2026-05-21" })).toBe(6);
    expect(run('DATETIME_DIFF(TODAY(), {Born}, "year")', { Born: "2000-11-22" })).toBe(25);
    expect(run('DATEADD("2026-01-31", 1, "month")')).toBe("2026-02-28");
    expect(run('DATEADD("2028-02-29", 1, "year")')).toBe("2029-02-28");
    expect(run('YEAR({D}) & "-" & MONTH({D}) & "-" & DAY({D})', { D: "2026-03-09" })).toBe("2026-3-9");
    // as in NocoDB: 0 is the first day of the week, Monday unless told (21 November 2026 is a Saturday)
    expect(run('WEEKDAY("2026-11-21")')).toBe(5);
    expect(run('WEEKDAY("2026-11-21", "sunday")')).toBe(6);
  });

  it("SWITCH maps a value, with a default", () => {
    const f = 'SWITCH({State}, "Waiting", 1, "In trial", 2, 0)';
    expect(run(f, { State: "In trial" })).toBe(2);
    expect(run(f, { State: "Alumno" })).toBe(0);
  });

  it("give an empty value instead of failing", () => {
    expect(run("1 / 0")).toBeNull();
    expect(run('"abc" * 2')).toBeNull();
    expect(run('DATEADD("not a date", 1, "day")')).toBeNull();
  });

  it("refuse what they cannot read, with a sentence", () => {
    expect(() => parseFormula("CONCAT(")).toThrow(FormulaError);
    expect(() => parseFormula("NOPE(1)")).toThrow("Unknown function NOPE");
    expect(() => parseFormula("IF(1)")).toThrow("wrong number of arguments");
    expect(() => parseFormula('"open')).toThrow("not closed");
    expect(() => parseFormula("1 2")).toThrow(FormulaError);
    expect(() => parseFormula("{Name")).toThrow("not closed");
  });

  it("are saved with field ids, so renaming a field keeps them working", () => {
    const fields = [{ id: 7, name: "Name" }, { id: 8, name: "Surname" }];
    const stored = storeExpression('CONCAT({name}, " ", {Surname})', fields);
    expect(stored).toBe('CONCAT({#7}, " ", {#8})');
    expect(showExpression(stored, [{ id: 7, name: "First name" }, { id: 8, name: "Surname" }])).toBe('CONCAT({First name}, " ", {Surname})');
    expect(() => storeExpression("{Nope}", fields)).toThrow('There is no field called "Nope"');
  });
});
