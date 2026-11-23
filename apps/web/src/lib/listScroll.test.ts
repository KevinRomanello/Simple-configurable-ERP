import { describe, expect, it } from "vitest";
import { scrollToReveal } from "./listScroll";

// A list 100px tall, scrolled by 50px: it shows what is between 50 and 150.
describe("scrollToReveal", () => {
  it("does not move when the row is already in sight", () => {
    expect(scrollToReveal(50, 100, 60, 80)).toBe(50);
    expect(scrollToReveal(50, 100, 50, 70)).toBe(50); // flush with the top
    expect(scrollToReveal(50, 100, 130, 150)).toBe(50); // flush with the bottom
  });

  it("scrolls up just enough to show a row above", () => {
    expect(scrollToReveal(50, 100, 30, 50)).toBe(30);
    expect(scrollToReveal(50, 100, 45, 65)).toBe(45); // half hidden
  });

  it("scrolls down just enough to show a row below", () => {
    expect(scrollToReveal(50, 100, 150, 170)).toBe(70);
    expect(scrollToReveal(50, 100, 140, 160)).toBe(60); // half hidden
  });

  it("shows the top of a row taller than the list", () => {
    expect(scrollToReveal(0, 100, 200, 400)).toBe(200);
    expect(scrollToReveal(300, 100, 100, 400)).toBe(100);
  });

  it("starts from the top when nothing is scrolled", () => {
    expect(scrollToReveal(0, 100, 0, 20)).toBe(0);
  });
});
