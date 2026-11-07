import { withModelCatalogAuth } from "../_shared/model-catalog-auth.ts";

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

Deno.serve(withModelCatalogAuth(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) return json({ error: "GOOGLE_API_KEY is not configured" }, 500);

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1000`,
    );
    if (!r.ok) {
      const t = await r.text();
      console.error("Google models error", r.status, t);
      return json({ error: `Google error (${r.status})` }, 502);
    }
    const payload = await r.json();
    const models = (payload?.models ?? [])
      .map((m: any) => {
        const id = String(m.name ?? "").replace(/^models\//, "");
        if (!id) return null;
        const methods: string[] = m.supportedGenerationMethods ?? [];
        const lower = id.toLowerCase();
        const isImage =
          methods.includes("predict") ||
          /image|imagen/.test(lower);
        const isChat = methods.includes("generateContent") && !isImage;
        const kind = isImage ? "image" : isChat ? "chat" : null;
        if (!kind) return null;
        return {
          id,
          name: m.displayName ?? id,
          kind,
          context_length: m.inputTokenLimit ?? null,
          pricing: null,
        };
      })
      .filter(Boolean);
    return json({ models });
  } catch (e) {
    console.error("google-models error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
}));
