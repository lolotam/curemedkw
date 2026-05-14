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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

    const all: any[] = [];
    let url: string | null = "https://api.anthropic.com/v1/models?limit=100";
    while (url) {
      const r: Response = await fetch(url, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!r.ok) {
        const t = await r.text();
        console.error("Anthropic models error", r.status, t);
        return json({ error: `Anthropic error (${r.status})` }, 502);
      }
      const payload = await r.json();
      const data = payload?.data ?? [];
      all.push(...data);
      if (payload?.has_more && payload?.last_id) {
        url = `https://api.anthropic.com/v1/models?limit=100&after_id=${encodeURIComponent(payload.last_id)}`;
      } else {
        url = null;
      }
    }

    const models = all.map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      kind: "chat" as const,
      context_length: null,
      pricing: null,
    }));
    return json({ models });
  } catch (e) {
    console.error("anthropic-models error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
