import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

interface TranslateInput {
  name?: string;
  category?: string;
  shortDescription?: string;
  longDescription?: string;
  usage?: string;
  benefits?: string[];
  ingredients?: string[];
}

interface TranslateOutput {
  name_ar: string;
  category_ar: string;
  short_description_ar: string;
  long_description_ar: string;
  usage_ar: string;
  benefits_ar: string[];
  ingredients_ar: string[];
}

async function translateWithAI(input: TranslateInput, model: string): Promise<TranslateOutput> {
  const sys =
    "You translate cosmetic and pharmaceutical product copy from English to natural Modern Standard Arabic suitable for a Kuwaiti consumer audience. Preserve markdown bullet structure. Keep brand names, ingredient INCI names and SKUs in their original Latin form. Be concise — do not invent claims that are not in the source. Always answer by calling the provided tool.";

  const tool = {
    type: "function",
    function: {
      name: "save_translation",
      description: "Return the Arabic translation of every provided field.",
      parameters: {
        type: "object",
        properties: {
          name_ar: { type: "string" },
          category_ar: { type: "string" },
          short_description_ar: { type: "string" },
          long_description_ar: { type: "string" },
          usage_ar: { type: "string" },
          benefits_ar: { type: "array", items: { type: "string" } },
          ingredients_ar: { type: "array", items: { type: "string" } },
        },
        required: [
          "name_ar",
          "category_ar",
          "short_description_ar",
          "long_description_ar",
          "usage_ar",
          "benefits_ar",
          "ingredients_ar",
        ],
        additionalProperties: false,
      },
    },
  };

  const userPayload = {
    name: input.name ?? "",
    category: input.category ?? "",
    short_description: input.shortDescription ?? "",
    long_description: input.longDescription ?? "",
    usage: input.usage ?? "",
    benefits: input.benefits ?? [],
    ingredients: input.ingredients ?? [],
  };

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://curemedkw.lovable.app",
      "X-Title": "Curemed Admin",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content:
            "Translate every field of the following product into Arabic. Keep arrays the same length and order. Source JSON:\n" +
            JSON.stringify(userPayload, null, 2),
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "save_translation" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("OpenRouter rate limit hit. Try again in a moment.");
    if (resp.status === 402) throw new Error("OpenRouter credits exhausted. Top up your OpenRouter account.");
    throw new Error(`OpenRouter error ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("AI did not return a translation tool call.");

  const parsed = JSON.parse(call.function.arguments) as TranslateOutput;
  // Defensive defaults
  return {
    name_ar: parsed.name_ar ?? "",
    category_ar: parsed.category_ar ?? "",
    short_description_ar: parsed.short_description_ar ?? "",
    long_description_ar: parsed.long_description_ar ?? "",
    usage_ar: parsed.usage_ar ?? "",
    benefits_ar: Array.isArray(parsed.benefits_ar) ? parsed.benefits_ar : [],
    ingredients_ar: Array.isArray(parsed.ingredients_ar) ? parsed.ingredients_ar : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const productId: string | undefined = body.productId;
    const persist: boolean = body.persist !== false;
    const overwrite: boolean = body.overwrite === true;

    let source: TranslateInput;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (productId) {
      const { data, error } = await admin
        .from("products")
        .select(
          "id,name,category,short_description,long_description,usage,benefits,ingredients,name_ar"
        )
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Product not found");
      if (!overwrite && data.name_ar && data.name_ar.trim().length > 0) {
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: "Already translated" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      source = {
        name: data.name,
        category: data.category,
        shortDescription: data.short_description,
        longDescription: data.long_description,
        usage: data.usage,
        benefits: data.benefits ?? [],
        ingredients: data.ingredients ?? [],
      };
    } else {
      source = {
        name: body.name,
        category: body.category,
        shortDescription: body.shortDescription,
        longDescription: body.longDescription,
        usage: body.usage,
        benefits: body.benefits ?? [],
        ingredients: body.ingredients ?? [],
      };
    }

    // Resolve translate model from site_settings (single source of truth).
    let translateModel = "google/gemini-2.5-flash";
    try {
      const { data: settingRow } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "ai_translate_model")
        .maybeSingle();
      const v = (settingRow as any)?.value;
      if (typeof v === "string" && v.trim().length > 0) translateModel = v.trim();
    } catch (e) {
      console.error("failed to read ai_translate_model:", e);
    }
    console.log("translate-product model:", translateModel);

    const translated = await translateWithAI(source, translateModel);

    if (productId && persist) {
      const { error: upErr } = await admin
        .from("products")
        .update(translated)
        .eq("id", productId);
      if (upErr) throw upErr;
    }

    return new Response(JSON.stringify({ ok: true, translation: translated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("translate-product error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});