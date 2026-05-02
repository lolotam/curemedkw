/**
 * Client-side image → WebP converter.
 * Uses the browser Canvas API so no server-side processing is needed.
 */

const WEBP_MIME = "image/webp";

/**
 * Convert an image File to WebP format.
 * - Skips files that are already WebP.
 * - Skips non-image files (videos, PDFs, etc.).
 * - Falls back to the original file if conversion fails.
 *
 * @param file  The source image file
 * @param quality  WebP quality 0-1 (default 0.82)
 */
export async function convertToWebP(file: File, quality = 0.82): Promise<File> {
  // Skip non-image or already-webp
  if (!file.type.startsWith("image/") || file.type === WEBP_MIME) {
    return file;
  }

  // Skip SVGs — they're already efficient vectors
  if (file.type === "image/svg+xml") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: WEBP_MIME, quality });

    // Build a new filename with .webp extension
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webp`, { type: WEBP_MIME });
  } catch {
    // If anything fails (e.g. OffscreenCanvas not supported), return original
    console.warn("[imageConvert] WebP conversion failed, using original file");
    return file;
  }
}