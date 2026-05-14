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

type Provider = "openrouter" | "openai" | "google";
interface Slot { provider: Provider; model: string }

const DEFAULT_PROMPT =
  "Upscale this product image to a higher resolution. Preserve every product detail exactly: shape, colors, packaging text, logos, branding, materials, lighting and background. Do NOT add, remove, restyle or reinterpret anything. Output a clean, sharp, photorealistic version of the same image at a larger size.";

const DEFAULT_IMAGE_CHAIN: Slot[] = [
  { provider: "google", model: "gemini-2.5-flash-image" },
  { provider: "openai", model: "gpt-image-1" },
  { provider: "openrouter", model: "google/gemini-2.5-flash-image" },
];

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

interface AiResult {
  ok: boolean;
  bytes?: Uint8Array;
  contentType?: string;
  error?: string;
}

async function callGoogle(model: string, prompt: string, imgB64: string, imgMime: string, key: string): Promise<AiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const resp = await fetch(url, {
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
  });
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

async function callOpenAI(model: string, prompt: string, srcBlob: Blob, key: string): Promise<AiResult> {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", prompt);
  fd.append("image", srcBlob, "source.png");
  fd.append("size", "auto");
  const resp = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `openai ${resp.status}: ${t.slice(0, 300)}` };
  }
  const data = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "openai: no image in response" };
  return { ok: true, bytes: base64ToBytes(b64), contentType: "image/png" };
}

async function callOpenRouter(model: string, prompt: string, imgDataUrl: string, key: string): Promise<AiResult> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `openrouter ${resp.status}: ${t.slice(0, 300)}` };
  }
  const data = await resp.json();
  const msg = data?.choices?.[0]?.message;
  const images = msg?.images;
  if (Array.isArray(images) && images[0]?.image_url?.url) {
    const url: string = images[0].image_url.url;
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (m) return { ok: true, bytes: base64ToBytes(m[2]), contentType: m[1] };
    // remote URL fallback
    const r = await fetch(url);
    if (r.ok) return { ok: true, bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "image/png" };
  }
  return { ok: false, error: "openrouter: no image in response" };
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
    const extraInstructions = String(body?.extraInstructions ?? "").trim();
    const sanitize = (s: unknown) => {
      const v = String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      return v.slice(0, 64) || "_unsorted";
    };
    const brandSeg = sanitize(body?.brand);
    const slugSeg = sanitize(body?.productSlug);
    if (!/^https?:\/\//i.test(imageUrl)) return json({ error: "Provide a valid http(s) imageUrl" }, 400);

    // Load prompt + image slot chain from site_settings
    const [promptRow, modelsRow] = await Promise.all([
      admin.from("site_settings").select("value").eq("key", "ai_upscale_prompt").maybeSingle(),
      admin.from("site_settings").select("value").eq("key", "ai_import_models").maybeSingle(),
    ]);

    const promptVal = (promptRow.data as any)?.value;
    const basePrompt = (typeof promptVal === "string" && promptVal.trim()) ? promptVal.trim() : DEFAULT_PROMPT;
    const fullPrompt = extraInstructions ? `${basePrompt}\n\nAdditional instructions: ${extraInstructions}` : basePrompt;

    let chain: Slot[] = [];
    const mv = (modelsRow.data as any)?.value;
    if (mv && typeof mv === "object" && Array.isArray(mv.image)) {
      chain = (mv.image as any[])
        .map((s) => ({
          provider: (["openrouter", "openai", "google"].includes(s?.provider) ? s.provider : "google") as Provider,
          model: String(s?.model ?? "").trim(),
        }))
        .filter((s) => s.model.length > 0);
    }
    if (chain.length === 0) chain = DEFAULT_IMAGE_CHAIN;

    // Fetch source image once
    const srcResp = await fetch(imageUrl);
    if (!srcResp.ok) return json({ error: `Failed to fetch source image (${srcResp.status})` }, 400);
    const srcMime = srcResp.headers.get("content-type") || "image/png";
    const srcBytes = new Uint8Array(await srcResp.arrayBuffer());
    const srcBlob = new Blob([srcBytes], { type: srcMime });
    const srcB64 = bytesToBase64(srcBytes);
    const srcDataUrl = `data:${srcMime};base64,${srcB64}`;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const googleKey = Deno.env.get("GOOGLE_API_KEY");
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");

    const errors: string[] = [];
    let success: { result: AiResult; slot: Slot } | null = null;

    for (const slot of chain) {
      let res: AiResult;
      try {
        if (slot.provider === "google") {
          if (!googleKey) { errors.push(`${slot.provider}:${slot.model} -> GOOGLE_API_KEY missing`); continue; }
          res = await callGoogle(slot.model, fullPrompt, srcB64, srcMime, googleKey);
        } else if (slot.provider === "openai") {
          if (!openaiKey) { errors.push(`${slot.provider}:${slot.model} -> OPENAI_API_KEY missing`); continue; }
          res = await callOpenAI(slot.model, fullPrompt, srcBlob, openaiKey);
        } else {
          if (!openrouterKey) { errors.push(`${slot.provider}:${slot.model} -> OPENROUTER_API_KEY missing`); continue; }
          res = await callOpenRouter(slot.model, fullPrompt, srcDataUrl, openrouterKey);
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
    }

    if (!success) {
      return json({ error: "All AI image models failed", details: errors }, 502);
    }

    const ct = success.result.contentType || "image/png";
    const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
    const path = `${brandSeg}/${slugSeg}/upscaled-ai/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("product-images")
      .upload(path, success.result.bytes!, { contentType: ct, upsert: false });
    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);
    const { data: pub } = admin.storage.from("product-images").getPublicUrl(path);

    return json({
      url: pub.publicUrl,
      originalUrl: imageUrl,
      provider: success.slot.provider,
      model: success.slot.model,
      attempts: errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
