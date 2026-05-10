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

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return json({ error: "OPENROUTER_API_KEY is not configured" }, 500);

    // Authoritative model chain comes from site_settings.ai_import_models.
    // Client-supplied `model` / `fallbackModels` are accepted only as a last-
    // resort fallback when the settings row is missing — this guarantees the
    // /admin/models page is the single source of truth across browsers and
    // both the Lovable Cloud and self-hosted deployments.
    const DEFAULT_CHAIN = [
      "openai/gpt-4o-mini",
      "google/gemini-2.0-flash-001",
      "anthropic/claude-3.5-haiku",
    ];

    let dbChain: string[] | null = null;
    try {
      const { data: settingRow } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "ai_import_models")
        .maybeSingle();
      const v = (settingRow as any)?.value;
      if (Array.isArray(v)) {
        dbChain = v.map((m: unknown) => String(m ?? "").trim()).filter((m: string) => m.length > 0);
      }
    } catch (e) {
      console.error("failed to read ai_import_models from site_settings:", e);
    }

    const clientModel = String(body?.model ?? "").trim();
    const clientFallback = Array.isArray(body?.fallbackModels)
      ? body.fallbackModels.map((m: unknown) => String(m ?? "").trim()).filter((m: string) => m.length > 0)
      : [];

    const sourceChain =
      dbChain && dbChain.length > 0
        ? dbChain
        : clientModel
          ? [clientModel, ...clientFallback]
          : DEFAULT_CHAIN;

    // Build dedup'd chain: primary + up to 2 fallbacks
    const chain: string[] = [];
    for (const m of sourceChain) {
      if (m && !chain.includes(m)) chain.push(m);
      if (chain.length >= 3) break;
    }
    console.log("extract-product chain:", chain.join(" -> "), "(source:", dbChain ? "db" : "client/default", ")");


    const callOpenRouter = (useModel: string) =>
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://curemedkw.lovable.app",
          "X-Title": "Curemed Admin",
        },
        body: JSON.stringify({
          model: useModel,
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `Source URL: ${sourceUrl}\n\nPAGE CONTENT (markdown):\n\n${markdown.slice(0, 60000)}`,
            },
          ],
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "set_product_fields" } },
          temperature: 0.2,
        }),
      });

    const attempts: Array<{ model: string; status: number; reason: string }> = [];

    for (const useModel of chain) {
      let r = await callOpenRouter(useModel);
      // Auto-retry once on 429 with short backoff
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await callOpenRouter(useModel);
      }

      if (r.status === 402) {
        attempts.push({ model: useModel, status: 402, reason: "payment_required" });
        continue;
      }
      if (r.status === 429) {
        attempts.push({ model: useModel, status: 429, reason: "rate_limited" });
        continue;
      }
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error("OpenRouter error", useModel, r.status, t);
        attempts.push({
          model: useModel,
          status: r.status,
          reason: `provider_error: ${t.slice(0, 200)}`,
        });
        continue;
      }

      const payload = await r.json().catch(() => null);
      const choice = payload?.choices?.[0];
      const call = choice?.message?.tool_calls?.[0];
      let args: any = null;
      if (call?.function?.arguments) {
        try {
          args = JSON.parse(call.function.arguments);
        } catch (e) {
          console.error("Failed to parse tool args", e, call.function.arguments);
        }
      }
      if (!args) {
        const raw = choice?.message?.content;
        if (typeof raw === "string") {
          try { args = JSON.parse(raw); } catch { /* ignore */ }
        }
      }
      if (!args) {
        attempts.push({ model: useModel, status: 200, reason: "no_structured_output" });
        continue;
      }

      return json({ fields: args, model: useModel, primaryModel: chain[0], attempts });
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