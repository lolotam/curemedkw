/**
 * Client-side image → WebP converter.
 * Uses the browser Canvas API so no server-side processing is needed.
 */

const WEBP_MIME = "image/webp";

interface CompressionConfig {
  enabled: boolean;
  quality: number; // 1-100
}

// Module-level config, kept in sync from React via setImageCompressionConfig.
let _config: CompressionConfig = { enabled: true, quality: 99 };

export function setImageCompressionConfig(next: Partial<CompressionConfig>) {
  _config = { ..._config, ...next };
}

export function getImageCompressionConfig(): CompressionConfig {
  return _config;
}

/**
 * Convert an image File to WebP format.
 * - Skips when compression is disabled in admin settings.
 * - Skips files that are already WebP.
 * - Skips non-image files (videos, PDFs, etc.) and SVGs.
 * - Falls back to the original file if conversion fails.
 *
 * @param file  The source image file
 * @param quality  Optional WebP quality 0-1 override; otherwise reads admin setting (1-100).
 */
export async function convertToWebP(file: File, quality?: number): Promise<File> {
  if (!_config.enabled) return file;

  if (!file.type.startsWith("image/") || file.type === WEBP_MIME) {
    return file;
  }
  if (file.type === "image/svg+xml") {
    return file;
  }

  const q = typeof quality === "number" ? quality : _config.quality / 100;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: WEBP_MIME, quality: q });

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webp`, { type: WEBP_MIME });
  } catch {
    console.warn("[imageConvert] WebP conversion failed, using original file");
    return file;
  }
}
