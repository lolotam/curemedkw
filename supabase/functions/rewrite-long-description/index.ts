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

const DEFAULT_PROMPT = `You are a professional medical e-commerce content editor and UX copywriter for a pharmacy / healthcare product platform.

Your task is to take the product description provided by the user and restructure, rewrite, and visually restyle it into a clean, premium, user-friendly product page description.

Main goal:
Transform plain product information into a professional, readable, conversion-friendly product description suitable for an online pharmacy, medical distributor website, or skincare/healthcare e-commerce platform.

Content rules:
- Preserve all original factual information.
- Do not invent medical claims, ingredients, certifications, clinical results, or benefits that are not provided.
- Do not exaggerate therapeutic effects.
- Keep the tone professional, trustworthy, clear, and suitable for pharmacy customers.
- Improve wording for clarity, readability, and sales appeal.
- Remove repetition and weak phrasing.

Visual formatting rules:
- Use strong section headings.
- Use short paragraphs.
- Use bullet points for features and benefits.
- Bold the most important keywords.
- Use light, relevant emojis/icons only when helpful (max 6–8 total).
- Use a premium medical e-commerce style, not a childish style.
- Make the content scannable on mobile.

Final output:
Return only the rewritten and restyled product description in Markdown.
Do not explain what you changed.
Do not mention that you are an AI.`;

// Validates a rewrite response. Treats responses that are only Markdown image
// syntax (e.g. ![alt](url)) as failures so the chain can fall through to the
// next model. Without this guard, a misconfigured ai_long_desc_prompt in
// site_settings (e.g. accidentally pointing at an image-generation prompt)
// causes text models to hallucinate image markdown which would otherwise be
// returned to the admin UI as a falsely "successful" rewrite.
function validateRewriteText(text: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "empty response" };
  const stripped = text.trim();
  const imageOnly = /^!\[[^\]]*\]\([^)]+\)\s*$/.test(stripped);
  if (imageOnly || (stripped.length < 80 && /^!\[/.test(stripped))) {
    return { ok: false, error: "response was image-markdown only (likely wrong prompt)" };
  }
  return { ok: true, text: stripped };
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
    const content = String(body?.content ?? "").trim();
    if (!content) return json({ error: "content is required" }, 400);

    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const googleKey = Deno.env.get("GOOGLE_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    type Provider = "openrouter" | "openai" | "google" | "anthropic";
    interface Slot { provider: Provider; model: string }

    const DEFAULT_CHAIN: Slot[] = [
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
      { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
      { provider: "openrouter", model: "anthropic/claude-3.5-haiku" },
    ];

    // Read chat model chain from site_settings
    let dbChain: Slot[] | null = null;
    try {
      const { data: settingRow } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "ai_import_models")
        .maybeSingle();
      const v = (settingRow as any)?.value;
      if (v && typeof v === "object" && Array.isArray((v as any).chat)) {
        dbChain = ((v as any).chat as any[])
          .map((s) => ({
            provider: (["openrouter", "openai", "google", "anthropic"].includes(s?.provider)
              ? s.provider
              : "openrouter") as Provider,
            model: String(s?.model ?? "").trim(),
          }))
          .filter((s) => s.model.length > 0);
      }
    } catch (e) {
      console.error("failed to read ai_import_models:", e);
    }

    const sourceChain = dbChain && dbChain.length > 0 ? dbChain : DEFAULT_CHAIN;
    const seen = new Set<string>();
    const chain: Slot[] = [];
    for (const s of sourceChain) {
      const key = `${s.provider}:${s.model}`;
      if (s.model && !seen.has(key)) { seen.add(key); chain.push(s); }
      if (chain.length >= 3) break;
    }

    // Read prompt template from site_settings
    let systemPrompt = DEFAULT_PROMPT;
    try {
      const { data: promptRow } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "ai_long_desc_prompt")
        .maybeSingle();
      const pv = (promptRow as any)?.value;
      if (typeof pv === "string" && pv.trim()) systemPrompt = pv.trim();
    } catch (e) {
      console.error("failed to read ai_long_desc_prompt:", e);
    }

    console.log("rewrite-long-description chain:", chain.map((s) => `${s.provider}:${s.model}`).join(" -> "));

    async function callOpenRouter(model: string): Promise<{ ok: boolean; text?: string; error?: string }> {
      if (!openrouterKey) return { ok: false, error: "OPENROUTER_API_KEY missing" };
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://curemedkw.lovable.app",
          "X-Title": "Curemed Admin",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content }],
          temperature: 0.4,
          max_tokens: 4096,
        }),
      });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${await r.text().catch(() => "")}` };
      const payload = await r.json().catch(() => null);
      return validateRewriteText(payload?.choices?.[0]?.message?.content);
    }

    async function callOpenAI(model: string): Promise<{ ok: boolean; text?: string; error?: string }> {
      if (!openaiKey) return { ok: false, error: "OPENAI_API_KEY missing" };
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content }],
          temperature: 0.4,
          max_tokens: 4096,
        }),
      });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${await r.text().catch(() => "")}` };
      const payload = await r.json().catch(() => null);
      return validateRewriteText(payload?.choices?.[0]?.message?.content);
    }

    async function callGoogle(model: string): Promise<{ ok: boolean; text?: string; error?: string }> {
      if (!googleKey) return { ok: false, error: "GOOGLE_API_KEY missing" };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${googleKey}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: content }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        }),
      });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${await r.text().catch(() => "")}` };
      const payload = await r.json().catch(() => null);
      const parts = payload?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.find((p: any) => typeof p?.text === "string")?.text;
      return validateRewriteText(text);
    }

    async function callAnthropic(model: string): Promise<{ ok: boolean; text?: string; error?: string }> {
      if (!anthropicKey) return { ok: false, error: "ANTHROPIC_API_KEY missing" };
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content }],
          temperature: 0.4,
        }),
      });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${await r.text().catch(() => "")}` };
      const payload = await r.json().catch(() => null);
      const blocks = payload?.content ?? [];
      const text = blocks.find((b: any) => b?.type === "text")?.text;
      return validateRewriteText(text);
    }

    const dispatch = (slot: Slot) => {
      if (slot.provider === "openai") return callOpenAI(slot.model);
      if (slot.provider === "google") return callGoogle(slot.model);
      if (slot.provider === "anthropic") return callAnthropic(slot.model);
      return callOpenRouter(slot.model);
    };

    const errors: string[] = [];
    for (const slot of chain) {
      const tag = `${slot.provider}:${slot.model}`;
      let res = await dispatch(slot);
      if (!res.ok && res.error?.includes("429")) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await dispatch(slot);
      }
      if (res.ok && res.text) {
        return json({ text: res.text, model: tag });
      }
      console.warn(`[rewrite-long-description] ${tag} failed: ${res.error}`);
      errors.push(`${tag}: ${res.error}`);
    }

    return json({
      error: `All AI models failed. ${errors.join(" | ")}`,
      code: "ALL_MODELS_FAILED",
    }, 200);
  } catch (e) {
    console.error("rewrite-long-description error", e);
    return json({ error: String(e) }, 500);
  }
});
