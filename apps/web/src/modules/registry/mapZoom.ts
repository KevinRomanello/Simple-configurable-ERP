// How the wheel and the trackpad zoom the map (pages/registry/Boards.tsx), as numbers, apart from the page. The zoom is continuous:
// the wheel gives dozens of small movements a second and each one zooms a little, and the map eases towards where they lead, so
// that it grows instead of jumping. The pictures of the map come in whole levels: the tiles of the nearest level are stretched
// (a little more or less than their size) to the zoom in between.

/** The side of a tile of the map, in pixels. */
export const TILE = 256;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 18;

/** How much movement of the wheel is a whole level of zoom (a notch of a mouse wheel is 100 of them). */
export const POINTS_PER_LEVEL = 450;
/** A movement counts for no more than this (a mouse spun hard, or a trackpad starting, sends one that is huge). */
export const MAX_POINTS = 150;
/** Pinching a trackpad sends the wheel little numbers (with Ctrl): they count this much more. */
export const PINCH_WEIGHT = 3;
/** A line of a wheel that turns by lines (Firefox) in pixels. */
export const LINE_PIXELS = 40;
/** How much of the way to where the zoom is going it goes at every drawing: the higher, the quicker it follows the fingers. */
export const EASE = 0.25;

export interface WheelInput {
  deltaY: number;
  /** 0: pixels, 1: lines, 2: pages. */
  deltaMode: number;
  /** A pinch on a trackpad arrives as a wheel with Ctrl. */
  ctrlKey: boolean;
}

/** What one movement of the wheel is worth, positive to zoom in (the wheel turned away from the person), at most MAX_POINTS. */
export function wheelPoints(e: WheelInput, pageHeight: number): number {
  const pixels = e.deltaMode === 1 ? e.deltaY * LINE_PIXELS : e.deltaMode === 2 ? e.deltaY * pageHeight : e.deltaY;
  const points = -pixels * (e.ctrlKey ? PINCH_WEIGHT : 1);
  return Math.max(-MAX_POINTS, Math.min(MAX_POINTS, points));
}

/** The levels of zoom a movement is worth (it can be a fraction). */
export const levelsOf = (points: number): number => points / POINTS_PER_LEVEL;

export const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/** Where the zoom is after one more drawing on its way to `target`: a part of the way, and the last bit in one go. */
export function approach(z: number, target: number): number {
  const next = z + (target - z) * EASE;
  return Math.abs(target - next) < 0.005 ? target : next;
}

export interface Camera {
  /** The zoom, not always a whole number. */
  z: number;
  /** The centre of the map, in the pixels of the whole world at this zoom. */
  x: number;
  y: number;
}

/**
 * The camera at zoom `z`, keeping the point of the map under `offset` (the pointer, in pixels from the centre of the map) where it
 * is on the screen. With no offset it zooms on the centre, like the + and − buttons.
 */
export function zoomTo(camera: Camera, z: number, offset: { x: number; y: number } = { x: 0, y: 0 }): Camera {
  const next = clampZoom(z);
  if (next === camera.z) return camera;
  const k = 2 ** (next - camera.z);
  return { z: next, x: (camera.x + offset.x) * k - offset.x, y: (camera.y + offset.y) * k - offset.y };
}

/** The level of the tiles to draw for a zoom: the nearest whole one, so that they are stretched by at most about 40%. */
export const tileZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z)));

export interface PlacedTile {
  key: string;
  /** The level of zoom of the tile. */
  level: number;
  /** The column and the row of the tile at its level (the column may be outside the world: the map repeats). */
  tx: number;
  ty: number;
  /** Where it goes on the map and how big it is, in whole pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The tiles of level `level` that cover a map of `width` x `height` pixels whose top left corner is at (`left`, `top`) in the
 * pixels of the world at zoom `z`. A tile is as big as `z` makes it; each one ends where the next begins, in whole pixels, so
 * that no thin line shows between them.
 */
export function tileLayout(z: number, level: number, left: number, top: number, width: number, height: number): PlacedTile[] {
  const size = TILE * 2 ** (z - level);
  const rows = 2 ** level;
  const tiles: PlacedTile[] = [];
  for (let ty = Math.floor(top / size); ty * size < top + height; ty++) {
    if (ty < 0 || ty >= rows) continue;
    const y = Math.round(ty * size - top);
    const h = Math.round((ty + 1) * size - top) - y;
    for (let tx = Math.floor(left / size); tx * size < left + width; tx++) {
      const x = Math.round(tx * size - left);
      tiles.push({ key: `${level}/${tx}/${ty}`, level, tx, ty, x, y, w: Math.round((tx + 1) * size - left) - x, h });
    }
  }
  return tiles;
}
