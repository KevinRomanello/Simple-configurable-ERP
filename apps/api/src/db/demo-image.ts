import { crc32, deflateSync } from "node:zlib";

// Pictures for the demonstration data: a coloured square with a shape in it. Written by hand
// (a PNG is a header, a few chunks and zlib-compressed rows) so that no image library is needed
// for something that is only there to have something to look at.

export type Shape = "circle" | "square" | "bars" | "diamond" | "ring";

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A `size` x `size` PNG: a diagonal gradient of `color` with a lighter `shape` in the middle. */
export function placeholderPng(size: number, color: [number, number, number], shape: Shape): Buffer {
  const rows = Buffer.alloc(size * (size * 3 + 1));
  const centre = (size - 1) / 2;
  const radius = size * 0.28;
  let at = 0;
  for (let y = 0; y < size; y++) {
    rows[at++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const shade = 1 - ((x + y) / (2 * size)) * 0.45;
      let [r, g, b] = color.map((c) => c * shade);
      const dx = x - centre;
      const dy = y - centre;
      const inside =
        shape === "circle" ? dx * dx + dy * dy <= radius * radius
        : shape === "ring" ? Math.abs(Math.hypot(dx, dy) - radius) <= size * 0.06
        : shape === "square" ? Math.abs(dx) <= radius && Math.abs(dy) <= radius
        : shape === "diamond" ? Math.abs(dx) + Math.abs(dy) <= radius * 1.3
        : Math.abs(dx) <= radius && Math.floor(((dy + radius) / (radius * 2)) * 5) % 2 === 0 && Math.abs(dy) <= radius;
      if (inside) [r, g, b] = [r!, g!, b!].map((c) => Math.min(255, c + 90 + 0.2 * (255 - c)));
      rows[at++] = Math.round(r!);
      rows[at++] = Math.round(g!);
      rows[at++] = Math.round(b!);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
