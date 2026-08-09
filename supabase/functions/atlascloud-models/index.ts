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

type ModelKind = "chat" | "image";

interface OutModel {
  id: string;
  name: string;
  kind: ModelKind;
  context_length: number | null;
  pricing: { prompt?: string; completion?: string } | null;
}

function kindFromAtlas(m: any): ModelKind | null {
  const type = String(m?.type ?? "").toLowerCase();
  if (type === "image") return "image";
  if (type === "text" || type === "llm" || type === "chat") return "chat";

  // Fallback: category/tag heuristics for mixed catalog rows
  const cats = Array.isArray(m?.categories) ? m.categories.map(String) : [];
  const tags = Array.isArray(m?.tags) ? m.tags.map(String) : [];
  const blob = [...cats, ...tags, String(m?.model ?? ""), String(m?.displayName ?? "")]
    .join(" ")
    .toUpperCase();
  if (blob.includes("VIDEO") || blob.includes("AUDIO") || blob.includes("3D")) return null;
  if (
    blob.includes("IMAGE") ||
    blob.includes("TEXT-TO-IMAGE") ||
    blob.includes("IMAGE-TO-IMAGE") ||
    /\/edit\b|\/text-to-image\b/i.test(String(m?.model ?? ""))
  ) {
    return "image";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ATLASCLOUD_API_KEY");
    if (!apiKey) return json({ error: "ATLASCLOUD_API_KEY is not configured" }, 500);

    // Catalog endpoint returns Image / Text / Video / Audio with stable model ids.
    const r = await fetch("https://api.atlascloud.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "curemedkw-edge/1.0",
      },
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("Atlas Cloud models error", r.status, t);
      return json({ error: `Atlas Cloud error (${r.status})` }, 502);
    }

    const payload = await r.json();
    const items: any[] = Array.isArray(payload?.data) ? payload.data : [];
    const models: OutModel[] = [];
    const seen = new Set<string>();

    for (const m of items) {
      const id = String(m?.model ?? m?.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      const kind = kindFromAtlas(m);
      if (!kind) continue;
      seen.add(id);

      const price = m?.price;
      let pricing: OutModel["pricing"] = null;
      if (price && typeof price === "object") {
        // Catalog price shape differs by modality; expose when numeric strings exist.
        const actual = price.actual ?? price.origin ?? {};
        const base = actual.base_price ?? actual.prompt ?? null;
        if (base != null) pricing = { prompt: String(base), completion: undefined };
      }

      models.push({
        id,
        name: String(m?.displayName ?? m?.name ?? id),
        kind,
        context_length: typeof m?.context_length === "number" ? m.context_length : null,
        pricing,
      });
    }

    // Also merge OpenAI-compatible /v1/models chat list (some text models only appear there).
    try {
      const chatR = await fetch("https://api.atlascloud.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "curemedkw-edge/1.0",
        },
      });
      if (chatR.ok) {
        const chatPayload = await chatR.json();
        const chatItems: any[] = Array.isArray(chatPayload?.data)
          ? chatPayload.data
          : Array.isArray(chatPayload)
            ? chatPayload
            : [];
        for (const m of chatItems) {
          const id = String(m?.id ?? m?.root ?? "").trim();
          if (!id || seen.has(id)) continue;
          const outs: string[] = Array.isArray(m?.output_modalities)
            ? m.output_modalities.map(String)
            : [];
          // Skip pure image-only entries from this list if any
          if (outs.length && outs.every((o) => o.toLowerCase() === "image")) continue;
          if (outs.length && !outs.some((o) => /text|chat/i.test(o)) && outs.some((o) => /image|video|audio/i.test(o))) {
            continue;
          }
          seen.add(id);
          models.push({
            id,
            name: String(m?.name ?? m?.description ?? id),
            kind: "chat",
            context_length: typeof m?.context_length === "number" ? m.context_length : null,
            pricing: m?.pricing
              ? {
                  prompt: m.pricing.prompt != null ? String(m.pricing.prompt) : undefined,
                  completion: m.pricing.completion != null ? String(m.pricing.completion) : undefined,
                }
              : null,
          });
        }
      }
    } catch (e) {
      console.warn("atlascloud /v1/models merge failed", e);
    }

    models.sort((a, b) => a.id.localeCompare(b.id));
    return json({ models });
  } catch (e) {
    console.error("atlascloud-models error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
