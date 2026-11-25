/**
 * Browser-side: shrinks a camera photo to at most 800×800 JPEG (quality 0.7)
 * before upload, so uploads are small and fast on mobile data.
 *
 * Kept light for tablets and phones (a camera photo is often 12–50 megapixels):
 * - The browser decodes the photo already shrunk (createImageBitmap with a
 *   target size), instead of opening the full-size picture in memory (that
 *   used ~200 MB per photo and made the browser warn that the page is slow).
 * - The JPEG is made in the background (toBlob), not while the screen waits.
 * - Everything is freed right after, so several photos in a row stay smooth.
 * Large camera files are fine: only the small result is uploaded.
 */

/** Files bigger than this are not photos from a camera */
const MAX_FILE_BYTES = 40 * 1024 * 1024;

/** A photo file, decoded at roughly the size we need (never the full camera size when the browser can help). */
async function decodeSmall(file: File, maxSide: number): Promise<{ source: CanvasImageSource; width: number; height: number; free: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // First the real size (cheap: only the header is read), then a decode straight at the target size
      const probe = await createImageBitmap(file, { resizeWidth: 64, resizeQuality: "low" } as ImageBitmapOptions).catch(() => null);
      const ratio = probe ? probe.height / probe.width : 1;
      probe?.close();
      const landscape = ratio <= 1;
      const opts: ImageBitmapOptions = landscape
        ? ({ resizeWidth: maxSide, resizeHeight: Math.max(1, Math.round(maxSide * ratio)), resizeQuality: "medium" } as ImageBitmapOptions)
        : ({ resizeHeight: maxSide, resizeWidth: Math.max(1, Math.round(maxSide / ratio)), resizeQuality: "medium" } as ImageBitmapOptions);
      const bitmap = await createImageBitmap(file, opts);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, free: () => bitmap.close() };
    } catch {
      // Older browsers: the picture below
    }
  }
  // Fallback: a link to the file (no copy of it as a long text), decoded once
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, free: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the photo"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/** Draws the decoded photo at most `maxSide` on its longer side and returns it as JPEG (base64). */
async function toJpeg(
  decoded: { source: CanvasImageSource; width: number; height: number },
  maxSide: number,
  quality: number,
  crop?: { sx: number; sy: number; side: number; size: number }
): Promise<string> {
  const canvas = document.createElement("canvas");
  if (crop) {
    canvas.width = crop.size;
    canvas.height = crop.size;
  } else {
    const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read the photo");
  if (crop) ctx.drawImage(decoded.source, crop.sx, crop.sy, crop.side, crop.side, 0, 0, crop.size, crop.size);
  else ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return canvas.toDataURL("image/jpeg", quality);
    return await blobToDataUrl(blob);
  } finally {
    // Free the drawing memory at once (tablets keep it otherwise until later)
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function compressPhoto(file: File, maxSide = 800): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Image must be less than 40MB");
  let decoded: Awaited<ReturnType<typeof decodeSmall>>;
  try {
    decoded = await decodeSmall(file, maxSide);
  } catch {
    throw new Error("Could not read the photo");
  }
  try {
    return await toJpeg(decoded, maxSide, 0.7);
  } finally {
    decoded.free();
  }
}

/** Profile photo: centre-cropped square, 256×256 JPEG (~15–25 KB). */
export async function squareAvatar(file: File, size = 256): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Image must be less than 40MB");
  let decoded: Awaited<ReturnType<typeof decodeSmall>>;
  try {
    // Decoded a little larger than the square, so the crop stays sharp
    decoded = await decodeSmall(file, size * 2);
  } catch {
    throw new Error("Could not read the photo");
  }
  try {
    const side = Math.min(decoded.width, decoded.height);
    return await toJpeg(decoded, size, 0.82, { sx: (decoded.width - side) / 2, sy: (decoded.height - side) / 2, side, size });
  } finally {
    decoded.free();
  }
}
