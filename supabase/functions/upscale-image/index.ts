import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const STANDARD_FACTORS = new Set([2, 4, 6, 8]);
const ULTRA_FACTORS = new Set([2, 4, 6, 8, 16]);
const TARGET_SIZES = new Set([1024, 1536, 2048]);
const DEFAULT_TARGET_SIZE = 1536;
const MAX_PIXELS = 23_000_000; // Picsart hard cap (~23MP output)

function normalizeTargetSize(value: unknown): number {
  const n = Number(value);
  return TARGET_SIZES.has(n) ? n : DEFAULT_TARGET_SIZE;
}

function pickFactorForTarget(dims: { w: number; h: number }, allowed: Set<number>, targetSize: number): { requested: number; effective: number; clamped: boolean } {
  const inputPixels = dims.w * dims.h;
  const longestSide = Math.max(dims.w, dims.h);
  const ascending = [...allowed].sort((a, b) => a - b);
  const requested = ascending.find((f) => longestSide * f >= targetSize) ?? ascending[ascending.length - 1];
  const fitting = ascending.filter((f) => inputPixels * f * f <= MAX_PIXELS);
  if (!fitting.length) {
    throw new Error(`Image is too large to upscale (${dims.w}x${dims.h}). Picsart caps output at 23MP. Try a smaller source image.`);
  }
  const effective = fitting.includes(requested)
    ? requested
    : fitting.filter((f) => f <= requested).at(-1) ?? fitting[fitting.length - 1];
  return { requested, effective, clamped: effective !== requested || longestSide * effective < targetSize };
}

function readImageSize(b: Uint8Array): { w: number; h: number } | null {
  // PNG: 8-byte sig, then IHDR at offset 16 (width), 20 (height), big-endian
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  // GIF: 'GIF87a'/'GIF89a', width/height at 6/8 little-endian
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  }
  // WebP: 'RIFF'....'WEBP'
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8 ") {
      const w = dv.getUint16(26, true) & 0x3fff;
      const h = dv.getUint16(28, true) & 0x3fff;
      return { w, h };
    }
    if (fourcc === "VP8L") {
      const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { w, h };
    }
    if (fourcc === "VP8X") {
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { w, h };
    }
  }
  // JPEG: scan SOF markers
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    while (i < b.length) {
      if (b[i] !== 0xff) return null;
      while (i < b.length && b[i] === 0xff) i++;
      const marker = b[i++];
      if (marker === 0xd8 || marker === 0xd9) return null;
      const segLen = dv.getUint16(i, false);
      const sof = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) {
        const h = dv.getUint16(i + 3, false);
        const w = dv.getUint16(i + 5, false);
        return { w, h };
      }
      i += segLen;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return json({ error: "Admin only" }, 403);

    const apiKey = Deno.env.get("PICSART_API_KEY");
    if (!apiKey) return json({ error: "PICSART_API_KEY is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const imageUrl = String(body?.imageUrl ?? "").trim();
    const mode = body?.mode === "ultra" ? "ultra" : "standard";
    const hasTargetSize = body?.targetSize !== undefined;
    const requestedTarget = normalizeTargetSize(body?.targetSize);
    const factor = Number(body?.factor);
    const format = ["JPG", "PNG", "WEBP"].includes(body?.format) ? body.format : "JPG";
    const sanitize = (s: unknown) => {
      const v = String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      return v.slice(0, 64) || "_unsorted";
    };
    const brandSeg = sanitize(body?.brand);
    const slugSeg = sanitize(body?.productSlug);

    if (!/^https?:\/\//i.test(imageUrl)) {
      return json({ error: "Provide a valid http(s) imageUrl" }, 400);
    }
    const allowed = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;
    if (!hasTargetSize && !allowed.has(factor)) {
      return json({ error: `Invalid factor for ${mode} mode` }, 400);
    }

    // Fetch source image
    const srcResp = await fetch(imageUrl);
    if (!srcResp.ok) return json({ error: `Failed to fetch source image (${srcResp.status})` }, 400);
    const srcBuf = new Uint8Array(await srcResp.arrayBuffer());
    const srcType = srcResp.headers.get("content-type") || "image/jpeg";
    const srcBlob = new Blob([srcBuf], { type: srcType });

    // Read intrinsic image dimensions from header bytes (PNG / JPEG / WebP / GIF)
    const dims = readImageSize(srcBuf);
    let requestedFactor = hasTargetSize ? 2 : factor;
    let effectiveFactor = requestedFactor;
    let clamped = false;
    if (dims) {
      try {
        if (hasTargetSize) {
          const picked = pickFactorForTarget(dims, allowed, requestedTarget);
          requestedFactor = picked.requested;
          effectiveFactor = picked.effective;
          clamped = picked.clamped;
        } else {
          const inputPixels = dims.w * dims.h;
          const candidates = [...allowed].filter((f) => f <= factor).sort((a, b) => b - a);
          const fit = candidates.find((f) => inputPixels * f * f <= MAX_PIXELS);
          if (!fit) {
            return json(
              {
                error: `Image is too large to upscale (${dims.w}x${dims.h}). Picsart caps output at 23MP. Try a smaller source image.`,
              },
              400,
            );
          }
          effectiveFactor = fit;
          clamped = effectiveFactor !== requestedFactor;
        }
      } catch (e) {
        return json(
          {
            error: e instanceof Error ? e.message : "Unable to choose an upscale factor",
          },
          400,
        );
      }
    }

    // Build multipart form for Picsart
    const fd = new FormData();
    fd.append("upscale_factor", String(effectiveFactor));
    fd.append("format", format);
    if (mode === "ultra") fd.append("mode", "sync");
    fd.append("image", srcBlob, "source");

    const endpoint =
      mode === "ultra"
        ? "https://api.picsart.io/tools/1.0/upscale/ultra"
        : "https://api.picsart.io/tools/1.0/upscale";

    const picsartResp = await fetch(endpoint, {
      method: "POST",
      headers: { "X-Picsart-API-Key": apiKey, accept: "application/json" },
      body: fd,
    });

    const picsartJson = await picsartResp.json().catch(() => ({}));
    if (!picsartResp.ok) {
      return json(
        { error: picsartJson?.message || `Picsart error ${picsartResp.status}`, details: picsartJson },
        picsartResp.status,
      );
    }

    const resultUrl: string | undefined = picsartJson?.data?.url;
    if (!resultUrl) return json({ error: "Picsart did not return an image URL", details: picsartJson }, 502);

    // Re-host the result in our bucket so it doesn't expire
    const resultResp = await fetch(resultUrl);
    if (!resultResp.ok) return json({ error: "Failed to download Picsart result" }, 502);
    const resultBytes = new Uint8Array(await resultResp.arrayBuffer());
    const ext = format.toLowerCase() === "jpg" ? "jpg" : format.toLowerCase();
    const contentType =
      ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp";
    const path = `${brandSeg}/${slugSeg}/upscaled/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from("product-images")
      .upload(path, resultBytes, { contentType, upsert: false });
    if (uploadErr) return json({ error: `Upload failed: ${uploadErr.message}` }, 500);

    return json({
      url: `${Deno.env.get("SUPABASE_PUBLIC_URL") || supabaseUrl}/storage/v1/object/public/product-images/${path}`,
      originalUrl: imageUrl,
      mode,
      factor: effectiveFactor,
      requestedFactor,
      requestedTarget,
      clamped,
      format,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
