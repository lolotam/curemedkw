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

export function toAbsoluteImageUrl(src: string): string {
  if (!src) return src;
  if (/^https?:\/\//i.test(src)) return src;
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return src;
  return `${base}${src.startsWith("/") ? "" : "/"}${src}`;
}

export async function ensureOpenAISupportedFormat(
  imageUrl: string,
  options: { allowExternal?: boolean } = {},
): Promise<{ imageUrl?: string; imageBase64?: string; imageMime?: string }> {
  // Guard: must be absolute http(s) URL; callers should normalize first.
  if (!/^https?:\/\//i.test(imageUrl)) return { imageUrl };

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

  // By default we only attempt client-side canvas conversion for images from
  // our own Supabase Storage. External CDN images (e.g. pharmazone.com) often
  // block CORS fetches. The upscale edge function fetches them server-side.
  // Pass `allowExternal: true` to attempt conversion regardless (used by the
  // import flow, which falls back to the original URL on CORS failure).
  if (!options.allowExternal) {
    try {
      const hostname = new URL(imageUrl).hostname;
      if (!hostname.includes("supabase") && !hostname.includes("curemedkw")) {
        return { imageUrl };
      }
    } catch {
      return { imageUrl };
    }
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

// ---------------------------------------------------------------------------
// Convert scraped external image → PNG and upload to our own storage so
// downstream consumers (OpenAI upscale, etc.) get a clean PNG URL.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/clientRuntime";

const SAFE_EXT_RE = /\.(png|jpe?g)$/i;

function sanitizeSeg(s: string): string {
  const v = (s ?? "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return v.slice(0, 64) || "_unsorted";
}

/**
 * For use during product import.
 * - If the URL already ends in .png/.jpg/.jpeg, returns it unchanged.
 * - If it's WebP/AVIF, converts to PNG client-side (via OffscreenCanvas)
 *   and uploads to the `product-images` bucket under
 *   `<brand>/<slug>/imported/<uuid>.png`, returning the public URL.
 * - On any failure (CORS, decode error, upload error), returns the original
 *   URL so the import never breaks.
 */
export async function convertAndUploadImage(
  url: string,
  brand: string,
  slug: string,
): Promise<string> {
  try {
    const bare = url.split("?")[0];
    if (SAFE_EXT_RE.test(bare)) return url;

    const res = await ensureOpenAISupportedFormat(url, { allowExternal: true });
    if (!res.imageBase64 || !res.imageMime) return url;

    const bin = atob(res.imageBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });

    const path = `${sanitizeSeg(brand)}/${sanitizeSeg(slug)}/imported/${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, blob, { contentType: "image/png", upsert: false });
    if (error) {
      console.warn("[imageConvert] upload failed, falling back to original URL", error);
      return url;
    }
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.warn("[imageConvert] convertAndUploadImage failed, falling back to original URL", e);
    return url;
  }
}
