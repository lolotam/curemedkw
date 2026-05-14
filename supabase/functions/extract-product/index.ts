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

const SYSTEM = `You are a product-data extraction assistant for an e-commerce admin.
Given the markdown of a product page, extract the structured product fields.

Rules:
- Map the brand to one of: "flexitol", "kapiva", "nada", "abc". Pick the closest match if uncertain.
  - "Australian Bodycare" or "ABC" -> "abc"
  - "Flexitol" -> "flexitol"
  - "Kapiva" -> "kapiva"
  - "Nad's" or "Nada" -> "nada"
- "longDescription" must be markdown formatted with "##" section headings (Overview, Key features, etc.) and "-" bullet lists. Be thorough.
- "shortDescription" is a single sentence, max ~180 chars.
- "ingredients" and "benefits" are arrays of single short strings (one item per line).
- "usage" is a short paragraph or numbered steps.
- "category" is a short, broad area like "Foot Care", "Body Care", "Hair Care", "Wellness", etc. Title-cased, max 3 words.
- "tags" is 3 to 8 short keywords (lowercase, single words or 2-word phrases) describing the product (e.g. ["dry skin", "moisturizer", "tea tree"]).
- If a field is not present in the source, leave it empty ("" or []).
- Never invent SKUs, prices, or sizes that aren't explicitly stated.
- "price" must be a number in the listed currency (no symbols). 0 if unknown.
`;

const TOOL = {
  type: "function",
  function: {
    name: "set_product_fields",
    description: "Return the structured product fields extracted from the page",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        brand: { type: "string", enum: ["flexitol", "kapiva", "nada", "abc"] },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        price: { type: "number" },
        shortDescription: { type: "string" },
        longDescription: { type: "string" },
        size: { type: "string" },
        sku: { type: "string" },
        ingredients: { type: "array", items: { type: "string" } },
        benefits: { type: "array", items: { type: "string" } },
        usage: { type: "string" },
      },
      required: [
        "name",
        "brand",
        "category",
        "tags",
        "price",
        "shortDescription",
        "longDescription",
        "size",
        "sku",
        "ingredients",
        "benefits",
        "usage",
      ],
      additionalProperties: false,
    },
  },
} as const;

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
    const markdown = String(body?.markdown ?? "").trim();
    const sourceUrl = String(body?.sourceUrl ?? "").trim();
    if (!markdown) return json({ error: "markdown is required" }, 400);

    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const googleKey = Deno.env.get("GOOGLE_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    type Provider = "openrouter" | "openai" | "google" | "anthropic";
    interface Slot { provider: Provider; model: string }

    // Authoritative model chain comes from site_settings.ai_import_models
    // (managed in /admin/models). Reads both the new shape
    //   { chat: Slot[], image: Slot[] }
    // and the legacy flat string[] (treated as openrouter chat slots).
    const DEFAULT_CHAIN: Slot[] = [
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
      { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
      { provider: "openrouter", model: "anthropic/claude-3.5-haiku" },
    ];

    let dbChain: Slot[] | null = null;
    try {
      const { data: settingRow } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "ai_import_models")
        .maybeSingle();
      const v = (settingRow as any)?.value;
      if (Array.isArray(v)) {
        dbChain = v
          .map((m: unknown) => String(m ?? "").trim())
          .filter((m: string) => m.length > 0)
          .map((m: string) => ({ provider: "openrouter" as Provider, model: m }));
      } else if (v && typeof v === "object" && Array.isArray((v as any).chat)) {
        dbChain = ((v as any).chat as any[])
          .map((s) => ({
            provider: (["openrouter", "openai", "google", "anthropic"].includes(s?.provider) ? s.provider : "openrouter") as Provider,
            model: String(s?.model ?? "").trim(),
          }))
          .filter((s) => s.model.length > 0);
      }
    } catch (e) {
      console.error("failed to read ai_import_models from site_settings:", e);
    }

    const clientModel = String(body?.model ?? "").trim();
    const clientFallback = Array.isArray(body?.fallbackModels)
      ? body.fallbackModels.map((m: unknown) => String(m ?? "").trim()).filter((m: string) => m.length > 0)
      : [];

    const sourceChain: Slot[] =
      dbChain && dbChain.length > 0
        ? dbChain
        : clientModel
          ? [clientModel, ...clientFallback].map((m) => ({ provider: "openrouter" as Provider, model: m }))
          : DEFAULT_CHAIN;

    const seen = new Set<string>();
    const chain: Slot[] = [];
    for (const s of sourceChain) {
      const key = `${s.provider}:${s.model}`;
      if (s.model && !seen.has(key)) {
        seen.add(key);
        chain.push(s);
      }
      if (chain.length >= 3) break;
    }
    console.log("extract-product chain:", chain.map((s) => `${s.provider}:${s.model}`).join(" -> "));

    const userContent = `Source URL: ${sourceUrl}\n\nPAGE CONTENT (markdown):\n\n${markdown.slice(0, 60000)}`;

    async function callOpenRouter(model: string): Promise<{ ok: boolean; status: number; args?: any; text?: string }> {
      if (!openrouterKey) return { ok: false, status: 500, text: "OPENROUTER_API_KEY missing" };
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
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userContent }],
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "set_product_fields" } },
          temperature: 0.2,
        }),
      });
      if (!r.ok) return { ok: false, status: r.status, text: await r.text().catch(() => "") };
      const payload = await r.json().catch(() => null);
      const choice = payload?.choices?.[0];
      const call = choice?.message?.tool_calls?.[0];
      let args: any = null;
      if (call?.function?.arguments) {
        try { args = JSON.parse(call.function.arguments); } catch (e) { console.error("parse args", e); }
      }
      if (!args) {
        const raw = choice?.message?.content;
        if (typeof raw === "string") { try { args = JSON.parse(raw); } catch { /* ignore */ } }
      }
      return { ok: true, status: 200, args };
    }

    async function callOpenAI(model: string): Promise<{ ok: boolean; status: number; args?: any; text?: string }> {
      if (!openaiKey) return { ok: false, status: 500, text: "OPENAI_API_KEY missing" };
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userContent }],
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "set_product_fields" } },
          temperature: 0.2,
        }),
      });
      if (!r.ok) return { ok: false, status: r.status, text: await r.text().catch(() => "") };
      const payload = await r.json().catch(() => null);
      const choice = payload?.choices?.[0];
      const call = choice?.message?.tool_calls?.[0];
      let args: any = null;
      if (call?.function?.arguments) {
        try { args = JSON.parse(call.function.arguments); } catch (e) { console.error("parse args", e); }
      }
      return { ok: true, status: 200, args };
    }

    async function callGoogle(model: string): Promise<{ ok: boolean; status: number; args?: any; text?: string }> {
      if (!googleKey) return { ok: false, status: 500, text: "GOOGLE_API_KEY missing" };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${googleKey}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          tools: [{ functionDeclarations: [TOOL.function] }],
          toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["set_product_fields"] } },
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!r.ok) return { ok: false, status: r.status, text: await r.text().catch(() => "") };
      const payload = await r.json().catch(() => null);
      const parts = payload?.candidates?.[0]?.content?.parts ?? [];
      const fc = parts.find((p: any) => p?.functionCall)?.functionCall;
      let args: any = fc?.args ?? null;
      if (!args) {
        const raw = parts.find((p: any) => typeof p?.text === "string")?.text;
        if (raw) { try { args = JSON.parse(raw); } catch { /* ignore */ } }
      }
      return { ok: true, status: 200, args };
    }

    async function callAnthropic(model: string): Promise<{ ok: boolean; status: number; args?: any; text?: string }> {
      if (!anthropicKey) return { ok: false, status: 500, text: "ANTHROPIC_API_KEY missing" };
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
          system: SYSTEM,
          messages: [{ role: "user", content: userContent }],
          tools: [{
            name: TOOL.function.name,
            description: TOOL.function.description,
            input_schema: TOOL.function.parameters,
          }],
          tool_choice: { type: "tool", name: TOOL.function.name },
          temperature: 0.2,
        }),
      });
      if (!r.ok) return { ok: false, status: r.status, text: await r.text().catch(() => "") };
      const payload = await r.json().catch(() => null);
      const blocks = payload?.content ?? [];
      const tu = blocks.find((b: any) => b?.type === "tool_use");
      const args = tu?.input ?? null;
      return { ok: true, status: 200, args };
    }

    const dispatch = async (slot: Slot) => {
      if (slot.provider === "openai") return callOpenAI(slot.model);
      if (slot.provider === "google") return callGoogle(slot.model);
      if (slot.provider === "anthropic") return callAnthropic(slot.model);
      return callOpenRouter(slot.model);
    };

    const attempts: Array<{ model: string; status: number; reason: string }> = [];

    for (const slot of chain) {
      const tag = `${slot.provider}:${slot.model}`;
      let res = await dispatch(slot);
      if (!res.ok && res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await dispatch(slot);
      }
      if (!res.ok) {
        if (res.status === 402) { attempts.push({ model: tag, status: 402, reason: "payment_required" }); continue; }
        if (res.status === 429) { attempts.push({ model: tag, status: 429, reason: "rate_limited" }); continue; }
        console.error("provider error", tag, res.status, res.text);
        attempts.push({ model: tag, status: res.status, reason: `provider_error: ${(res.text ?? "").slice(0, 200)}` });
        continue;
      }
      if (!res.args) {
        attempts.push({ model: tag, status: 200, reason: "no_structured_output" });
        continue;
      }
      return json({ fields: res.args, model: tag, primaryModel: `${chain[0].provider}:${chain[0].model}`, attempts });
    }

    // All models in the chain failed — return 200 with structured error
    const lastReason = attempts[attempts.length - 1]?.reason || "unknown";
    const isAllRateLimited = attempts.every((a) => a.status === 429);
    const isAllPayment = attempts.every((a) => a.status === 402);
    return json({
      error: isAllRateLimited
        ? "All selected AI models are rate limited right now. Please wait a few seconds and try again."
        : isAllPayment
          ? "All selected AI models are out of credits. Top up your OpenRouter account or pick different models."
          : `All AI models failed (last: ${lastReason}). Try different models.`,
      code: "ALL_MODELS_FAILED",
      attempts,
      fallback: true,
    });
  } catch (e) {
    console.error("extract-product error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});