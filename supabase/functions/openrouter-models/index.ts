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

function classify(m: any): "chat" | "image" {
  const arch = m?.architecture ?? {};
  const outs: string[] = arch.output_modalities ?? arch.output_modality ?? [];
  const outsArr = Array.isArray(outs) ? outs : [outs];
  if (outsArr.some((o) => typeof o === "string" && o.toLowerCase().includes("image"))) {
    return "image";
  }
  const modality = String(arch.modality ?? "").toLowerCase();
  if (modality.includes("->image") || modality.endsWith("image")) return "image";
  return "chat";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return json({ error: "OPENROUTER_API_KEY is not configured" }, 500);

    const r = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("OpenRouter models error", r.status, t);
      return json({ error: `OpenRouter error (${r.status})` }, 502);
    }
    const payload = await r.json();
    const models = (payload?.data ?? []).map((m: any) => ({
      id: m.id,
      name: m.name ?? m.id,
      kind: classify(m),
      context_length: m.context_length ?? null,
      pricing: m.pricing ?? null,
    }));
    return json({ models });
  } catch (e) {
    console.error("openrouter-models error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
