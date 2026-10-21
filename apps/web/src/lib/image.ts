/** The size a picture has when it is shrunk to fit a square of `max` pixels; never made bigger. */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** How many bytes a base64 text stands for. */
export function base64Bytes(text: string): number {
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  return (text.length / 4) * 3 - padding;
}

async function jpeg(bitmap: ImageBitmap, max: number, quality: number): Promise<string> {
  const { width, height } = fitSize(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff"; // a transparent picture would turn black as a JPEG
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("The picture could not be read");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Shrinks a picture chosen by the person to what the server takes: a full one (1200 px) and a
 * small one for the lists (240 px), both JPEG. The server never has to deal with a 12-megapixel
 * photograph, and no image library is needed there.
 */
export async function prepareImage(file: File): Promise<{ mime: "image/jpeg"; full: string; thumb: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    let full = await jpeg(bitmap, 1200, 0.82);
    for (let quality = 0.7; base64Bytes(full) > 560_000 && quality > 0.3; quality -= 0.1) full = await jpeg(bitmap, 1200, quality);
    const thumb = await jpeg(bitmap, 240, 0.8);
    return { mime: "image/jpeg", full, thumb };
  } finally {
    bitmap.close();
  }
}
