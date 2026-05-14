import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Provider = "openrouter" | "openai" | "google" | "anthropic";

async function pingOpenRouter(model: string, key: string) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
  });
  return r;
}

async function pingOpenAI(model: string, key: string) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_completion_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
  });
  return r;
}

async function pingGoogle(model: string, key: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1 },
    }),
  });
  return r;
}

async function pingAnthropic(model: string, key: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
  });
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);
    const token = auth.replace(/^Bearer\s+/i, "");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const { data: roleData } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userRes.user.id).eq("role", "admin").maybeSingle();
    if (!roleData) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider ?? "") as Provider;
    const model = String(body?.model ?? "").trim();
    if (!model) return json({ error: "Model is required" }, 400);

    const keyName: Record<Provider, string> = {
      openrouter: "OPENROUTER_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
    };
    const key = Deno.env.get(keyName[provider]);
    if (!key) return json({ ok: false, error: `${keyName[provider]} is not configured` }, 200);

    const t0 = Date.now();
    let r: Response;
    try {
      if (provider === "openrouter") r = await pingOpenRouter(model, key);
      else if (provider === "openai") r = await pingOpenAI(model, key);
      else if (provider === "google") r = await pingGoogle(model, key);
      else if (provider === "anthropic") r = await pingAnthropic(model, key);
      else return json({ ok: false, error: `Unknown provider: ${provider}` }, 200);
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
    }
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      const t = await r.text();
      return json({ ok: false, latency_ms, status: r.status, error: t.slice(0, 400) }, 200);
    }
    await r.text();
    return json({ ok: true, latency_ms, provider, model }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
