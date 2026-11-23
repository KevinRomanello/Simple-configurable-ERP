import { AppError, invalid } from "../../core/errors";

// The pictures of the map view (docs/anagrafiche.md, §6), fetched by the server and kept for a week: the
// browser asks only the ERP (the site allows no images from elsewhere, Caddyfile), and the server of the
// map never sees who looks at which place.

interface Tile {
  bytes: Buffer;
  type: string;
  at: number;
}

const KEEP_MS = 7 * 86_400_000;
const MAX_TILES = 2_000;
const tiles = new Map<string, Tile>();

/** The address of a tile. HARDCODED: a tile server chosen by the team, set in the settings of the registry. */
export function tileAddress(z: number, x: number, y: number): string {
  // HARDCODED: OpenStreetMap's public tiles (their policy: a few, kept, with a name of the program)
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/** GET /registry/tiles/:z/:x/:y.png: one tile of the map, from the cache or the tile server. */
export async function getTile(z: number, x: number, y: number): Promise<Tile> {
  const size = 2 ** z;
  if (z < 0 || z > 19 || x < 0 || y < 0 || x >= size || y >= size) throw invalid("There is no such tile");
  const key = `${z}/${x}/${y}`;
  const kept = tiles.get(key);
  if (kept && Date.now() - kept.at < KEEP_MS) return kept;
  let response: Response;
  try {
    response = await fetch(tileAddress(z, x, y), { headers: { "User-Agent": "ERP-registry-map/1 (self-hosted team management)" }, signal: AbortSignal.timeout(8_000), redirect: "error" });
  } catch {
    throw new AppError(502, "The map cannot be reached from the server");
  }
  if (!response.ok) throw new AppError(502, `The map answered ${response.status}`);
  const tile = { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "image/png", at: Date.now() };
  // the oldest go first when there are too many
  if (tiles.size >= MAX_TILES) tiles.delete(tiles.keys().next().value!);
  tiles.set(key, tile);
  return tile;
}
