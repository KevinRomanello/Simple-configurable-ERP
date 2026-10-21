import { describe, expect, it } from "vitest";
import { placeholderPng } from "./demo-image";

describe("placeholderPng", () => {
  it("makes a real PNG of the size asked for, small enough for the picture limits", () => {
    for (const shape of ["circle", "square", "bars", "diamond", "ring"] as const) {
      const png = placeholderPng(480, [40, 120, 200], shape);
      expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
      expect(png.readUInt32BE(16)).toBe(480); // width, in the IHDR chunk
      expect(png.readUInt32BE(20)).toBe(480);
      expect(png.subarray(png.length - 8, png.length - 4).toString("latin1")).toBe("IEND");
      expect(png.length).toBeLessThan(600_000);
    }
    expect(placeholderPng(96, [200, 80, 40], "circle").length).toBeLessThan(80_000);
  });

  it("looks different for different colours and shapes", () => {
    expect(placeholderPng(32, [10, 10, 200], "circle").equals(placeholderPng(32, [200, 10, 10], "circle"))).toBe(false);
    expect(placeholderPng(32, [10, 10, 200], "circle").equals(placeholderPng(32, [10, 10, 200], "square"))).toBe(false);
  });
});
