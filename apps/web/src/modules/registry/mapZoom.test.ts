import { describe, expect, it } from "vitest";
import { EASE, LINE_PIXELS, MAX_POINTS, MAX_ZOOM, MIN_ZOOM, PINCH_WEIGHT, POINTS_PER_LEVEL, TILE, approach, clampZoom, levelsOf, tileLayout, tileZoom, wheelPoints, zoomTo } from "./mapZoom";

const notch = { deltaMode: 0, ctrlKey: false };

describe("wheelPoints", () => {
  it("is positive to zoom in (wheel turned away) and negative to zoom out, in pixels", () => {
    expect(wheelPoints({ ...notch, deltaY: -100 }, 800)).toBe(100);
    expect(wheelPoints({ ...notch, deltaY: 40 }, 800)).toBe(-40);
  });

  it("counts a line as a few pixels and a page as the height of the page, with a ceiling for what is huge", () => {
    expect(wheelPoints({ deltaY: -3, deltaMode: 1, ctrlKey: false }, 800)).toBe(3 * LINE_PIXELS);
    expect(wheelPoints({ deltaY: -1, deltaMode: 2, ctrlKey: false }, 800)).toBe(MAX_POINTS);
    expect(wheelPoints({ ...notch, deltaY: 5000 }, 800)).toBe(-MAX_POINTS);
  });

  it("counts the little numbers of a pinch (Ctrl) for more", () => {
    expect(wheelPoints({ deltaY: -2, deltaMode: 0, ctrlKey: true }, 800)).toBe(2 * PINCH_WEIGHT);
  });
});

describe("the zoom is continuous", () => {
  it("is a fraction of a level for a movement, so a notch of a mouse is a part of one", () => {
    expect(levelsOf(100)).toBeCloseTo(100 / POINTS_PER_LEVEL);
    expect(levelsOf(100)).toBeLessThan(1);
    expect(levelsOf(-POINTS_PER_LEVEL)).toBe(-1);
  });

  it("goes a part of the way at each drawing, and gets there", () => {
    expect(approach(10, 11)).toBeCloseTo(10 + EASE);
    let z = 10;
    let drawings = 0;
    while (z !== 11 && drawings < 200) {
      const next = approach(z, 11);
      expect(next).toBeGreaterThan(z); // it never goes back
      z = next;
      drawings++;
    }
    expect(z).toBe(11);
    expect(drawings).toBeLessThan(40); // less than a second
  });

  it("goes down the same way", () => {
    expect(approach(11, 10)).toBeLessThan(11);
    expect(approach(10.001, 10)).toBe(10);
  });
});

describe("clampZoom and tileZoom", () => {
  it("keep the zoom between the nearest and the farthest level", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(30)).toBe(MAX_ZOOM);
    expect(clampZoom(10.4)).toBe(10.4);
  });

  it("draw the tiles of the nearest whole level", () => {
    expect(tileZoom(10)).toBe(10);
    expect(tileZoom(10.4)).toBe(10);
    expect(tileZoom(10.6)).toBe(11);
    expect(tileZoom(40)).toBe(MAX_ZOOM);
  });
});

describe("zoomTo", () => {
  const camera = { z: 10, x: 5000, y: 3000 };

  it("zooms on the centre with no pointer: the pixels double with a level", () => {
    expect(zoomTo(camera, 11)).toEqual({ z: 11, x: 10000, y: 6000 });
    expect(zoomTo(camera, 9)).toEqual({ z: 9, x: 2500, y: 1500 });
  });

  it("works in fractions of a level", () => {
    const half = zoomTo(camera, 10.5);
    expect(half.z).toBe(10.5);
    expect(half.x).toBeCloseTo(5000 * Math.SQRT2);
    // two halves are a whole one
    const twice = zoomTo(half, 11);
    expect(twice.x).toBeCloseTo(10000);
    expect(twice.y).toBeCloseTo(6000);
  });

  it("keeps the point under the pointer where it is on the screen, at any zoom", () => {
    const offset = { x: 120, y: -80 }; // right of and above the centre
    for (const z of [10.25, 10.5, 11, 9.3]) {
      const zoomed = zoomTo(camera, z, offset);
      const k = 2 ** (z - camera.z);
      // the point of the world under the pointer, before and after: the same place, scaled
      expect(zoomed.x + offset.x).toBeCloseTo((camera.x + offset.x) * k);
      expect(zoomed.y + offset.y).toBeCloseTo((camera.y + offset.y) * k);
    }
  });

  it("stops at the nearest and the farthest level, and does not move the map there", () => {
    expect(zoomTo({ ...camera, z: MAX_ZOOM }, 19, { x: 50, y: 50 })).toEqual({ ...camera, z: MAX_ZOOM });
    expect(zoomTo({ ...camera, z: MIN_ZOOM }, 0)).toEqual({ ...camera, z: MIN_ZOOM });
  });
});

describe("tileLayout", () => {
  const cover = (tiles: ReturnType<typeof tileLayout>, width: number, height: number) => {
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    return Math.min(...xs) <= 0 && Math.min(...ys) <= 0 && Math.max(...tiles.map((t) => t.x + t.w)) >= width && Math.max(...tiles.map((t) => t.y + t.h)) >= height;
  };

  it("draws the tiles of a whole level at their own size", () => {
    const tiles = tileLayout(10, 10, 5000, 3000, 800, 480);
    expect(tiles.every((t) => t.w === TILE && t.h === TILE)).toBe(true);
    expect(cover(tiles, 800, 480)).toBe(true);
    expect(tiles[0]).toMatchObject({ tx: Math.floor(5000 / TILE), ty: Math.floor(3000 / TILE) });
  });

  it("stretches them to the zoom in between, with each one ending where the next begins (no lines between them)", () => {
    for (const z of [10.3, 10.5, 10.77, 9.6]) {
      const tiles = tileLayout(z, Math.round(z), 5003.4, 3001.7, 800, 480);
      expect(cover(tiles, 800, 480)).toBe(true);
      for (const a of tiles) {
        const right = tiles.find((b) => b.ty === a.ty && b.tx === a.tx + 1);
        const below = tiles.find((b) => b.tx === a.tx && b.ty === a.ty + 1);
        if (right) expect(right.x).toBe(a.x + a.w);
        if (below) expect(below.y).toBe(a.y + a.h);
      }
      // whole pixels, and about the size the zoom says
      const size = TILE * 2 ** (z - Math.round(z));
      expect(tiles.every((t) => Number.isInteger(t.x) && Number.isInteger(t.w) && Math.abs(t.w - size) <= 1)).toBe(true);
    }
  });

  it("leaves out the rows that are outside the world, and lets the columns go round it", () => {
    const tiles = tileLayout(2, 2, -300, -100, 800, 480); // above and left of the world
    expect(tiles.every((t) => t.ty >= 0 && t.ty < 4)).toBe(true);
    expect(tiles.some((t) => t.tx < 0)).toBe(true); // the map repeats: the page wraps the column
  });
});
