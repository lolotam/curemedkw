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

function classify(id: string): "chat" | "image" | null {
  if (/^(dall-e|gpt-image)/i.test(id)) return "image";
  if (/^(gpt-|o1|o3|o4|chatgpt-)/i.test(id)) {
    // exclude obvious non-chat variants
    if (/-(audio|realtime|tts|transcribe|whisper|embedding|moderation)/i.test(id)) return null;
    return "chat";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY is not configured" }, 500);

    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("OpenAI models error", r.status, t);
      return json({ error: `OpenAI error (${r.status})` }, 502);
    }
    const payload = await r.json();
    const models = (payload?.data ?? [])
      .map((m: any) => {
        const kind = classify(String(m.id));
        if (!kind) return null;
        return { id: m.id, name: m.id, kind, context_length: null, pricing: null };
      })
      .filter(Boolean);
    return json({ models });
  } catch (e) {
    console.error("openai-models error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
