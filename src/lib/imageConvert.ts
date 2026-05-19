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

const OPENAI_UNSUPPORTED_MIMES = new Set(["image/avif", "image/webp"]);

export async function ensureOpenAISupportedFormat(
  imageUrl: string,
): Promise<{ imageUrl?: string; imageBase64?: string; imageMime?: string }> {
  // Extension-first detection avoids CORS failures on HEAD requests to self-hosted storage.
  // Supabase Storage preserves file extensions, so this is reliable for all uploaded assets.
  const EXT_TO_MIME: Record<string, string> = { avif: "image/avif", webp: "image/webp" };
  const urlPath = imageUrl.split("?")[0];
  const ext = urlPath.split(".").pop()?.toLowerCase() ?? "";
  let mime = EXT_TO_MIME[ext] ?? "";

  if (!mime) {
    try {
      const head = await fetch(imageUrl, { method: "HEAD" });
      mime = head.headers.get("content-type")?.split(";")[0].trim() ?? "";
    } catch {
      return { imageUrl };
    }
  }

  if (!OPENAI_UNSUPPORTED_MIMES.has(mime)) return { imageUrl };

  // Only attempt client-side canvas conversion for images from our own
  // Supabase Storage. External CDN images (e.g. pharmazone.com) either
  // block CORS fetches or produce oversized base64 bodies that the edge
  // runtime rejects silently. The edge function fetches them server-side.
  try {
    const hostname = new URL(imageUrl).hostname;
    if (!hostname.includes("supabase") && !hostname.includes("curemedkw")) {
      return { imageUrl };
    }
  } catch {
    return { imageUrl };
  }

  try {
    const resp = await fetch(imageUrl);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { imageUrl };
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return { imageBase64: btoa(binary), imageMime: "image/png" };
  } catch {
    console.warn("[imageConvert] AVIF/WebP→PNG conversion failed, using original URL");
    return { imageUrl };
  }
}
