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
    const model = String(body?.model ?? "openai/gpt-4o-mini").trim();
    if (!markdown) return json({ error: "markdown is required" }, 400);

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return json({ error: "OPENROUTER_API_KEY is not configured" }, 500);

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://curemedkw.lovable.app",
        "X-Title": "Curemed Admin",
      },
      body: JSON.stringify({
        model,
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

    if (r.status === 402) {
      return json({ error: "OpenRouter credits exhausted." }, 402);
    }
    if (r.status === 429) {
      return json({ error: "OpenRouter rate limit hit. Try again." }, 429);
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("OpenRouter error", r.status, t);
      return json({ error: `OpenRouter error (${r.status}): ${t.slice(0, 300)}` }, 502);
    }

    const payload = await r.json();
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
      // Fallback: try to parse direct content as JSON
      const raw = choice?.message?.content;
      if (typeof raw === "string") {
        try { args = JSON.parse(raw); } catch { /* ignore */ }
      }
    }
    if (!args) {
      return json({ error: "Model did not return structured fields" }, 502);
    }

    return json({ fields: args, model });
  } catch (e) {
    console.error("extract-product error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});