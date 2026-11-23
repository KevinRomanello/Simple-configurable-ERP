// MD5, SHA-256 and SHA-512 of a text (its UTF-8 bytes), as hexadecimal: the MD5, SHA256 and SHA512 of the
// formulas. Written out here because the engine runs without Node's crypto (it is shared with the site).

function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const c = char.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
const hex32 = (words: number[], littleEndian: boolean) =>
  words.map((w) => {
    const bytes = [w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255];
    return (littleEndian ? bytes.reverse() : bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }).join("");

/** The bytes padded to a whole number of blocks, with the length in bits at the end (MD5 and SHA). */
function pad(bytes: Uint8Array, block: number, lengthBytes: number, littleEndian: boolean): Uint8Array {
  const size = Math.ceil((bytes.length + 1 + lengthBytes) / block) * block;
  const out = new Uint8Array(size);
  out.set(bytes);
  out[bytes.length] = 0x80;
  const bits = BigInt(bytes.length) * 8n;
  for (let i = 0; i < 8; i++) {
    const byte = Number((bits >> BigInt(8 * i)) & 255n);
    if (littleEndian) out[size - lengthBytes + i] = byte;
    else out[size - 1 - i] = byte;
  }
  return out;
}

const MD5_SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(text: string): string {
  const data = pad(utf8(text), 64, 8, true);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let at = 0; at < data.length; at += 64) {
    const m = Array.from({ length: 16 }, (_, i) => data[at + 4 * i]! | (data[at + 4 * i + 1]! << 8) | (data[at + 4 * i + 2]! << 16) | (data[at + 4 * i + 3]! << 24));
    let [a, b, c, d] = h as [number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const sum = (a + f + MD5_K[i]! + m[g]!) | 0;
      const shift = MD5_SHIFTS[round * 4 + (i % 4)]!;
      [a, d, c] = [d, c, b];
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    h[0] = (h[0]! + a) | 0;
    h[1] = (h[1]! + b) | 0;
    h[2] = (h[2]! + c) | 0;
    h[3] = (h[3]! + d) | 0;
  }
  return hex32(h.map((w) => w >>> 0), true);
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256(text: string): string {
  const data = pad(utf8(text), 64, 8, false);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let at = 0; at < data.length; at += 64) {
    const w: number[] = [];
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = (data[at + 4 * i]! << 24) | (data[at + 4 * i + 1]! << 16) | (data[at + 4 * i + 2]! << 8) | data[at + 4 * i + 3]!;
      else {
        const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
        const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
        w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
      }
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i]! + w[i]!) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i]! + v) | 0));
  }
  return hex32(h.map((w) => w >>> 0), false);
}

const M64 = (1n << 64n) - 1n;
const SHA512_K = [
  "428a2f98d728ae22", "7137449123ef65cd", "b5c0fbcfec4d3b2f", "e9b5dba58189dbbc", "3956c25bf348b538", "59f111f1b605d019", "923f82a4af194f9b", "ab1c5ed5da6d8118",
  "d807aa98a3030242", "12835b0145706fbe", "243185be4ee4b28c", "550c7dc3d5ffb4e2", "72be5d74f27b896f", "80deb1fe3b1696b1", "9bdc06a725c71235", "c19bf174cf692694",
  "e49b69c19ef14ad2", "efbe4786384f25e3", "0fc19dc68b8cd5b5", "240ca1cc77ac9c65", "2de92c6f592b0275", "4a7484aa6ea6e483", "5cb0a9dcbd41fbd4", "76f988da831153b5",
  "983e5152ee66dfab", "a831c66d2db43210", "b00327c898fb213f", "bf597fc7beef0ee4", "c6e00bf33da88fc2", "d5a79147930aa725", "06ca6351e003826f", "142929670a0e6e70",
  "27b70a8546d22ffc", "2e1b21385c26c926", "4d2c6dfc5ac42aed", "53380d139d95b3df", "650a73548baf63de", "766a0abb3c77b2a8", "81c2c92e47edaee6", "92722c851482353b",
  "a2bfe8a14cf10364", "a81a664bbc423001", "c24b8b70d0f89791", "c76c51a30654be30", "d192e819d6ef5218", "d69906245565a910", "f40e35855771202a", "106aa07032bbd1b8",
  "19a4c116b8d2d0c8", "1e376c085141ab53", "2748774cdf8eeb99", "34b0bcb5e19b48a8", "391c0cb3c5c95a63", "4ed8aa4ae3418acb", "5b9cca4f7763e373", "682e6ff3d6b2b8a3",
  "748f82ee5defb2fc", "78a5636f43172f60", "84c87814a1f0ab72", "8cc702081a6439ec", "90befffa23631e28", "a4506cebde82bde9", "bef9a3f7b2c67915", "c67178f2e372532b",
  "ca273eceea26619c", "d186b8c721c0c207", "eada7dd6cde0eb1e", "f57d4f7fee6ed178", "06f067aa72176fba", "0a637dc5a2c898a6", "113f9804bef90dae", "1b710b35131c471b",
  "28db77f523047d84", "32caab7b40c72493", "3c9ebe0a15c9bebc", "431d67c49c100d4c", "4cc5d4becb3e42b6", "597f299cfc657e2a", "5fcb6fab3ad6faec", "6c44198c4a475817",
].map((k) => BigInt(`0x${k}`));

export function sha512(text: string): string {
  const data = pad(utf8(text), 128, 16, false);
  const h = ["6a09e667f3bcc908", "bb67ae8584caa73b", "3c6ef372fe94f82b", "a54ff53a5f1d36f1", "510e527fade682d1", "9b05688c2b3e6c1f", "1f83d9abfb41bd6b", "5be0cd19137e2179"].map((x) => BigInt(`0x${x}`));
  const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & M64;
  for (let at = 0; at < data.length; at += 128) {
    const w: bigint[] = [];
    for (let i = 0; i < 80; i++) {
      if (i < 16) {
        let x = 0n;
        for (let j = 0; j < 8; j++) x = (x << 8n) | BigInt(data[at + 8 * i + j]!);
        w[i] = x;
      } else {
        const s0 = rotr(w[i - 15]!, 1n) ^ rotr(w[i - 15]!, 8n) ^ (w[i - 15]! >> 7n);
        const s1 = rotr(w[i - 2]!, 19n) ^ rotr(w[i - 2]!, 61n) ^ (w[i - 2]! >> 6n);
        w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) & M64;
      }
    }
    let [a, b, c, d, e, f, g, hh] = h as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
    for (let i = 0; i < 80; i++) {
      const t1 = (hh + (rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n)) + ((e & f) ^ (~e & M64 & g)) + SHA512_K[i]! + w[i]!) & M64;
      const t2 = ((rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n)) + ((a & b) ^ (a & c) ^ (b & c))) & M64;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) & M64, c, b, a, (t1 + t2) & M64];
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i]! + v) & M64));
  }
  return h.map((x) => x.toString(16).padStart(16, "0")).join("");
}
