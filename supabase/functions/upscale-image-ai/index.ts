import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Provider = "openrouter" | "openai" | "google" | "atlascloud";
interface Slot { provider: Provider; model: string }

const VALID_IMAGE_PROVIDERS = new Set<Provider>(["openrouter", "openai", "google", "atlascloud"]);

const DEFAULT_PROMPT =
  "Upscale this product image to a higher resolution. Preserve every product detail exactly: shape, colors, packaging text, logos, branding, materials, lighting and background. Do NOT add, remove, restyle or reinterpret anything. Output a clean, sharp, photorealistic version of the same image at a larger size.";

const DEFAULT_IMAGE_CHAIN: Slot[] = [
  { provider: "atlascloud", model: "openai/gpt-image-2/edit" },
  { provider: "openrouter", model: "google/gemini-3-pro-image-preview" },
  { provider: "google", model: "gemini-3.1-flash-image-preview" },
];

// Cloudflare in front of self-hosted Supabase has a hard ~100s timeout.
// Keep per-provider attempts short so we can try fallbacks AND still return
// a real response (with CORS headers) before the proxy kills the connection.
// gpt-image-2 edit endpoint baseline (measured 2026-05-19):
//   quality=low,  230KB PNG, size=1024x1024 → HTTP 200 in 45s
//   quality=low,  230KB PNG, size=1536x1536 → HTTP 200 in 46s
//   quality=medium, 378KB PNG, size=auto    → >80s (timed out)
// Moderation alone is ~17s. Medium quality + larger payload pushes past 80s.
// 35s slot timeout deliberately fails fast instead of betting the whole request
// on one slow provider. Note the consequence: 35s is BELOW every measured
// gpt-image-2 latency above, so the OpenAI slots can no longer win — they burn
// one 35s timeout, then `timedOutProviders` skips the remaining OpenAI slots and
// OpenRouter serves the request. That is the intended trade: a guaranteed Gemini
// answer beats an OpenAI answer the proxy may kill before it reaches the client.
// Every slot is capped by Math.min(PROVIDER_TIMEOUT_MS, remaining - 2s), so no
// slot ever exceeds 35s regardless of how much budget is left.
const PROVIDER_TIMEOUT_MS = 35_000;
// Hard overall budget for the whole function. Cloudflare proxy in front of
// self-hosted Supabase cuts at ~100s, so this is the ceiling we can use.
// Worst case is 35s (OpenAI times out) + 35s (OpenRouter) = 70s, leaving ~15s
// under the 85s budget for the storage upload and the JSON response — and ~30s
// under Cloudflare's cut, so the client always gets a real CORS response.
const TOTAL_BUDGET_MS = 85_000;
const TARGET_SIZES = new Set([1024, 1536, 2048]);
const DEFAULT_TARGET_SIZE = 1536;

function normalizeTargetSize(value: unknown): number {
  const n = Number(value);
  return TARGET_SIZES.has(n) ? n : DEFAULT_TARGET_SIZE;
}

function targetFromLegacyOutputSize(value: unknown): number | null {
  const v = String(value ?? "");
  if (v.startsWith("2048")) return 2048;
  if (v.startsWith("1536") || v.endsWith("1536")) return 1536;
  if (v.startsWith("1024") || v.endsWith("1024")) return 1024;
  return null;
}

// Always pass "auto" so gpt-image-2 picks an output size that matches the input
// image's aspect ratio (and the prompt). Forcing a fixed size like 1024x1536
// reframes square product photos as portrait, which is rarely what we want.
// The 1K/1.5K/2K selector continues to drive `quality` (latency tier), not size.
function openAiOutputSizeForTarget(_targetSize: number, _dims: { w: number; h: number } | null): "auto" {
  return "auto";
}

// quality is the real latency knob for gpt-image-2: low ~10s, medium ~25s, high ~60-120s.
function openAiQualityForTarget(targetSize: number): "low" | "medium" | "high" {
  if (targetSize <= 1024) return "low";
  if (targetSize <= 1536) return "medium";
  return "high";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readImageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  }
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === "VP8 ") {
      return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
    }
    if (fourcc === "VP8L") {
      const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { w, h };
    }
    if (fourcc === "VP8X") {
      return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    while (i < b.length) {
      if (b[i] !== 0xff) return null;
      while (i < b.length && b[i] === 0xff) i++;
      const marker = b[i++];
      if (marker === 0xd8 || marker === 0xd9) return null;
      const segLen = dv.getUint16(i, false);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { h: dv.getUint16(i + 3, false), w: dv.getUint16(i + 5, false) };
      i += segLen;
    }
  }
  return null;
}

interface AiResult {
  ok: boolean;
  bytes?: Uint8Array;
  contentType?: string;
  error?: string;
}

async function callGoogle(model: string, prompt: string, imgB64: string, imgMime: string, key: string, timeoutMs: number): Promise<AiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: imgMime, data: imgB64 } },
        ],
      }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  }, timeoutMs, `google:${model}`);
  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `google ${resp.status}: ${t.slice(0, 300)}` };
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p?.inlineData ?? p?.inline_data;
    if (inline?.data) {
      return { ok: true, bytes: base64ToBytes(inline.data), contentType: inline.mimeType || inline.mime_type || "image/png" };
    }
  }
  return { ok: false, error: "google: no image in response" };
}

async function callOpenAI(model: string, prompt: string, srcBlob: Blob, sourceName: string, key: string, timeoutMs: number, outputSize: string, quality: string): Promise<AiResult> {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", prompt);
  fd.append("image[]", srcBlob, sourceName);
  fd.append("size", outputSize);
  fd.append("quality", quality);
  console.log(`[upscale-image-ai] openai request model=${model} size=${outputSize} quality=${quality} bytes=${srcBlob.size} mime=${srcBlob.type} timeout=${timeoutMs}ms`);
  const t0 = Date.now();
  const resp = await fetchWithTimeout("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  }, timeoutMs, `openai:${model}`);
  const dt = Date.now() - t0;
  if (!resp.ok) {
    const t = await resp.text();
    console.warn(`[upscale-image-ai] openai response model=${model} status=${resp.status} elapsed=${dt}ms body=${t.slice(0, 200).replace(/\s+/g, " ")}`);
    return { ok: false, error: `openai ${resp.status} (${dt}ms): ${t.slice(0, 500)}` };
  }
  console.log(`[upscale-image-ai] openai response model=${model} status=200 elapsed=${dt}ms`);
  const data = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "openai: no image in response" };
  return { ok: true, bytes: base64ToBytes(b64), contentType: "image/png" };
}

async function callOpenRouter(model: string, prompt: string, imgDataUrl: string, key: string, timeoutMs: number): Promise<AiResult> {
  const resp = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imgDataUrl } },
        ],
      }],
    }),
  }, timeoutMs, `openrouter:${model}`);
  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `openrouter ${resp.status}: ${t.slice(0, 300)}` };
  }
  const data = await resp.json();
  const msg = data?.choices?.[0]?.message;

  // Older OpenRouter format: msg.images[]
  const images = msg?.images;
  if (Array.isArray(images) && images[0]?.image_url?.url) {
    const url: string = images[0].image_url.url;
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (m) return { ok: true, bytes: base64ToBytes(m[2]), contentType: m[1] };
    const r = await fetch(url);
    if (r.ok) return { ok: true, bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "image/png" };
  }

  // Newer OpenRouter format (Gemini image models): msg.content[] with type="image_url"
  const content = msg?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === "image_url" && item?.image_url?.url) {
        const url: string = item.image_url.url;
        const m = url.match(/^data:([^;]+);base64,(.+)$/);
        if (m) return { ok: true, bytes: base64ToBytes(m[2]), contentType: m[1] };
        const r = await fetch(url);
        if (r.ok) return { ok: true, bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "image/png" };
      }
    }
  }

  return { ok: false, error: "openrouter: no image in response" };
}

async function uploadAtlasMedia(
  bytes: Uint8Array,
  mime: string,
  filename: string,
  key: string,
  timeoutMs: number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: mime || "image/png" }), filename);
  const resp = await fetchWithTimeout(
    "https://api.atlascloud.ai/api/v1/model/uploadMedia",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "User-Agent": "curemedkw-edge/1.0",
      },
      body: fd,
    },
    timeoutMs,
    "atlascloud:uploadMedia",
  );
  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `atlascloud upload ${resp.status}: ${t.slice(0, 300)}` };
  }
  const data = await resp.json().catch(() => null);
  const url = data?.data?.download_url ?? data?.data?.url ?? data?.download_url;
  if (!url || typeof url !== "string") {
    return { ok: false, error: "atlascloud upload: missing download_url" };
  }
  return { ok: true, url };
}

async function pollAtlasPrediction(
  predictionId: string,
  key: string,
  deadlineMs: number,
): Promise<AiResult> {
  const pollUrl = `https://api.atlascloud.ai/api/v1/model/prediction/${encodeURIComponent(predictionId)}`;
  while (Date.now() < deadlineMs) {
    const remaining = deadlineMs - Date.now();
    if (remaining < 500) break;
    const resp = await fetchWithTimeout(
      pollUrl,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "User-Agent": "curemedkw-edge/1.0",
        },
      },
      Math.min(15_000, remaining),
      `atlascloud:poll:${predictionId}`,
    );
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, error: `atlascloud poll ${resp.status}: ${t.slice(0, 300)}` };
    }
    const result = await resp.json().catch(() => null);
    const status = String(result?.data?.status ?? result?.status ?? "").toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success") {
      const outputs = result?.data?.outputs ?? result?.outputs ?? [];
      const out0 = Array.isArray(outputs) ? outputs[0] : null;
      const outUrl = typeof out0 === "string"
        ? out0
        : (out0?.url ?? out0?.image_url ?? out0?.download_url ?? null);
      if (!outUrl || typeof outUrl !== "string") {
        // base64 payload support
        const b64 = result?.data?.output_base64 ?? out0?.b64_json ?? out0?.base64;
        if (typeof b64 === "string" && b64) {
          return { ok: true, bytes: base64ToBytes(b64.replace(/^data:[^,]+,/, "")), contentType: "image/png" };
        }
        return { ok: false, error: "atlascloud: completed but no output URL" };
      }
      if (outUrl.startsWith("data:")) {
        const m = outUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (m) return { ok: true, bytes: base64ToBytes(m[2]), contentType: m[1] };
      }
      const imgResp = await fetchWithTimeout(outUrl, {}, Math.min(20_000, Math.max(1_000, deadlineMs - Date.now())), "atlascloud:download");
      if (!imgResp.ok) {
        return { ok: false, error: `atlascloud download ${imgResp.status}` };
      }
      const ct = imgResp.headers.get("content-type") || "image/png";
      return { ok: true, bytes: new Uint8Array(await imgResp.arrayBuffer()), contentType: ct };
    }
    if (status === "failed" || status === "error" || status === "canceled" || status === "cancelled") {
      const err = result?.data?.error ?? result?.error ?? status;
      return { ok: false, error: `atlascloud failed: ${typeof err === "string" ? err : JSON.stringify(err).slice(0, 200)}` };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, error: `atlascloud timed out waiting for prediction ${predictionId}` };
}

async function callAtlasCloud(
  model: string,
  prompt: string,
  sourceImageUrl: string | null,
  srcBytes: Uint8Array,
  srcMime: string,
  key: string,
  timeoutMs: number,
  quality: "low" | "medium" | "high",
): Promise<AiResult> {
  const deadline = Date.now() + timeoutMs;
  let imageUrl = sourceImageUrl && /^https?:\/\//i.test(sourceImageUrl) ? sourceImageUrl : null;

  // Edit models need a hosted URL. Upload when the source is not already public http(s).
  if (!imageUrl) {
    const uploadBudget = Math.min(20_000, Math.max(5_000, Math.floor(timeoutMs * 0.25)));
    const isJpeg = srcMime.includes("jpeg") || srcMime.includes("jpg");
    const filename = isJpeg ? "source.jpg" : "source.png";
    const uploaded = await uploadAtlasMedia(srcBytes, srcMime || "image/png", filename, key, uploadBudget);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };
    imageUrl = uploaded.url;
  }

  const remainingAfterUpload = deadline - Date.now();
  if (remainingAfterUpload < 5_000) {
    return { ok: false, error: "atlascloud: out of time after upload" };
  }

  // Prefer edit-style payload when model path looks like an edit model.
  const isEdit = /\/edit\b|image-to-image|remix|inpaint/i.test(model);
  const body: Record<string, unknown> = {
    model,
    prompt,
    enable_base64_output: false,
    enable_sync_mode: false,
    output_format: "png",
    quality,
    moderation: "low",
  };
  if (isEdit) {
    body.images = [imageUrl];
  } else {
    // Text-to-image models may still accept a reference image; include when available.
    body.images = [imageUrl];
  }

  console.log(`[upscale-image-ai] atlascloud request model=${model} quality=${quality} timeout=${timeoutMs}ms`);
  const t0 = Date.now();
  const genResp = await fetchWithTimeout(
    "https://api.atlascloud.ai/api/v1/model/generateImage",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "curemedkw-edge/1.0",
      },
      body: JSON.stringify(body),
    },
    Math.min(30_000, remainingAfterUpload),
    `atlascloud:generate:${model}`,
  );
  if (!genResp.ok) {
    const t = await genResp.text();
    console.warn(`[upscale-image-ai] atlascloud generate model=${model} status=${genResp.status} elapsed=${Date.now() - t0}ms body=${t.slice(0, 200)}`);
    return { ok: false, error: `atlascloud generate ${genResp.status}: ${t.slice(0, 400)}` };
  }
  const genJson = await genResp.json().catch(() => null);
  const predictionId = genJson?.data?.id ?? genJson?.id;
  if (!predictionId) {
    // Some sync responses may return outputs immediately
    const outputs = genJson?.data?.outputs ?? genJson?.outputs;
    const out0 = Array.isArray(outputs) ? outputs[0] : null;
    if (typeof out0 === "string" && out0.startsWith("http")) {
      const imgResp = await fetch(out0);
      if (imgResp.ok) {
        return { ok: true, bytes: new Uint8Array(await imgResp.arrayBuffer()), contentType: imgResp.headers.get("content-type") || "image/png" };
      }
    }
    return { ok: false, error: "atlascloud: missing prediction id" };
  }

  return await pollAtlasPrediction(String(predictionId), key, deadline);
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

    const body = await req.json().catch(() => ({}));
    const imageUrl = String(body?.imageUrl ?? "").trim();
    const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    const imageMime = typeof body?.imageMime === "string" ? body.imageMime : "";
    const requestedTarget = normalizeTargetSize(body?.targetSize ?? targetFromLegacyOutputSize(body?.outputSize));
    const extraInstructions = String(body?.extraInstructions ?? "").trim();
    const sanitize = (s: unknown) => {
      const v = String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      return v.slice(0, 64) || "_unsorted";
    };
    const brandSeg = sanitize(body?.brand);
    const slugSeg = sanitize(body?.productSlug);
    if (!imageBase64 && !/^https?:\/\//i.test(imageUrl)) {
      return json({ error: "Provide a valid http(s) imageUrl or imageBase64+imageMime" }, 400);
    }

    // Load prompt + image slot chain from site_settings
    const [promptRow, modelsRow] = await Promise.all([
      admin.from("site_settings").select("value").eq("key", "ai_upscale_prompt").maybeSingle(),
      admin.from("site_settings").select("value").eq("key", "ai_import_models").maybeSingle(),
    ]);

    const promptVal = isRecord(promptRow.data) ? promptRow.data.value : undefined;
    const basePrompt = (typeof promptVal === "string" && promptVal.trim()) ? promptVal.trim() : DEFAULT_PROMPT;
    const fullPrompt = extraInstructions ? `${basePrompt}\n\nAdditional instructions: ${extraInstructions}` : basePrompt;

    let chain: Slot[] = [];
    const mv = isRecord(modelsRow.data) ? modelsRow.data.value : undefined;
    const imageSlots = isRecord(mv) && Array.isArray(mv.image) ? mv.image : [];
    if (imageSlots.length) {
      chain = imageSlots
        .map((s) => ({
          provider: (isRecord(s) && VALID_IMAGE_PROVIDERS.has(String(s.provider) as Provider)
            ? String(s.provider)
            : "google") as Provider,
          model: String(isRecord(s) ? s.model ?? "" : "").trim(),
        }))
        .filter((s) => s.model.length > 0);
    }
    if (chain.length === 0) chain = DEFAULT_IMAGE_CHAIN;

    // Deduplicate chain by provider:model so a misconfigured DB row with the
    // same model twice (e.g. snapshot alias + rolling alias) doesn't burn the
    // entire timeout budget on one model before fallbacks ever run.
    {
      const seen = new Set<string>();
      chain = chain.filter((slot) => {
        const key = `${slot.provider}:${slot.model}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Resolve source image bytes — use pre-converted base64 when provided (AVIF/WebP → PNG)
    let srcBytes: Uint8Array;
    let srcMime = imageMime || "image/png";
    if (imageBase64) {
      srcBytes = base64ToBytes(imageBase64.replace(/^data:[^,]+,/, ""));
    } else {
      const srcResp = await fetch(imageUrl);
      if (!srcResp.ok) return json({ error: `Failed to fetch source image (${srcResp.status})` }, 400);
      srcMime = srcResp.headers.get("content-type") || "image/png";
      srcBytes = new Uint8Array(await srcResp.arrayBuffer());
    }
    const isJpeg = srcMime.includes("jpeg") || srcMime.includes("jpg");
    // OpenAI /v1/images/edits only accepts PNG and JPEG. When the source is
    // WebP or AVIF, skip the OpenAI slot and let Google/OpenRouter handle it.
    // (The client-side ensureOpenAISupportedFormat() converts to PNG when possible,
    //  but external CDN images may arrive here in their original format.)
    const openAiCompatMime = isJpeg ? "image/jpeg" : "image/png";
    const openAiCompatExt = isJpeg ? "jpg" : "png";
    const openAiBlob = new Blob([srcBytes], { type: openAiCompatMime });
    const openAiName = `source.${openAiCompatExt}`;
    const srcBlob = new Blob([srcBytes], { type: srcMime });
    const srcB64 = bytesToBase64(srcBytes);
    const srcDataUrl = `data:${srcMime};base64,${srcB64}`;
    const outputSize = openAiOutputSizeForTarget(requestedTarget, readImageSize(srcBytes));
    const outputQuality = openAiQualityForTarget(requestedTarget);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const googleKey = Deno.env.get("GOOGLE_API_KEY");
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const atlasKey = Deno.env.get("ATLASCLOUD_API_KEY");

    const errors: string[] = [];
    let success: { result: AiResult; slot: Slot } | null = null;
    const startedAt = Date.now();
    const timedOutProviders = new Set<Provider>();
    // OpenAI images/edits accepts PNG and JPEG only. Skip OpenAI slots when
    // the source is WebP/AVIF so Google/OpenRouter are reached immediately
    // instead of burning the entire timeout budget on a certain rejection.
    const srcNeedsConversion = srcMime === "image/webp" || srcMime === "image/avif";
    const publicSourceUrl = !imageBase64 && /^https?:\/\//i.test(imageUrl) ? imageUrl : null;

    for (const slot of chain) {
      if (timedOutProviders.has(slot.provider)) {
        errors.push(`skipped ${slot.provider}:${slot.model} -> provider already timed out`);
        continue;
      }
      const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < 5_000) {
        errors.push(`skipped ${slot.provider}:${slot.model} -> out of time budget`);
        break;
      }
      // Atlas Cloud is async (submit + poll). Give it a longer slot when budget allows.
      const providerCap = slot.provider === "atlascloud" ? 70_000 : PROVIDER_TIMEOUT_MS;
      const slotTimeout = Math.min(providerCap, remaining - 2_000);
      if (srcNeedsConversion && slot.provider === "openai") {
        errors.push(`skipped ${slot.provider}:${slot.model} -> source format ${srcMime} requires PNG/JPEG`);
        continue;
      }
      let res: AiResult;
      try {
        if (slot.provider === "google") {
          if (!googleKey) { errors.push(`${slot.provider}:${slot.model} -> GOOGLE_API_KEY missing`); continue; }
          res = await callGoogle(slot.model, fullPrompt, srcB64, srcMime, googleKey, slotTimeout);
        } else if (slot.provider === "openai") {
          if (!openaiKey) { errors.push(`${slot.provider}:${slot.model} -> OPENAI_API_KEY missing`); continue; }
          res = await callOpenAI(slot.model, fullPrompt, openAiBlob, openAiName, openaiKey, slotTimeout, outputSize, outputQuality);
        } else if (slot.provider === "atlascloud") {
          if (!atlasKey) { errors.push(`${slot.provider}:${slot.model} -> ATLASCLOUD_API_KEY missing`); continue; }
          res = await callAtlasCloud(
            slot.model,
            fullPrompt,
            publicSourceUrl,
            srcBytes,
            srcMime,
            atlasKey,
            slotTimeout,
            outputQuality,
          );
        } else {
          if (!openrouterKey) { errors.push(`${slot.provider}:${slot.model} -> OPENROUTER_API_KEY missing`); continue; }
          res = await callOpenRouter(slot.model, fullPrompt, srcDataUrl, openrouterKey, slotTimeout);
        }
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (res.ok && res.bytes) {
        success = { result: res, slot };
        break;
      }
      console.warn(`[upscale-image-ai] ${slot.provider}:${slot.model} failed: ${res.error}`);
      errors.push(`${slot.provider}:${slot.model} -> ${res.error}`);
      if (res.error?.includes("timed out")) timedOutProviders.add(slot.provider);
    }

    if (!success) {
      return json({ ok: false, error: "All AI image models failed", details: errors });
    }

    const ct = success.result.contentType || "image/png";
    const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
    const path = `${brandSeg}/${slugSeg}/upscaled-ai/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("product-images")
      .upload(path, success.result.bytes!, { contentType: ct, upsert: false });
    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);
    const publicBaseUrl = Deno.env.get("SUPABASE_PUBLIC_URL") || supabaseUrl;
    const publicUrl = `${publicBaseUrl}/storage/v1/object/public/product-images/${path}`;

    return json({
      url: publicUrl,
      originalUrl: imageUrl,
      requestedTarget,
      outputSize,
      provider: success.slot.provider,
      model: success.slot.model,
      attempts: errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
