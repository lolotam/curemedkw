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
type Kind = "chat" | "image";

// Some upstream providers (e.g. Azure-hosted GPT-5.x via OpenRouter) require
// max output tokens >= 16. Use a safe minimum for all chat ping requests.
const PING_MAX_TOKENS = 16;

async function pingOpenRouterChat(model: string, key: string) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: PING_MAX_TOKENS,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
}

async function pingOpenAIChat(model: string, key: string) {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_completion_tokens: PING_MAX_TOKENS,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
}

async function pingGoogleChat(model: string, key: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: PING_MAX_TOKENS },
    }),
  });
}

async function pingAnthropicChat(model: string, key: string) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: PING_MAX_TOKENS,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
}

// For image models we don't actually generate an image (that would cost money
// and be slow). Instead we verify the API key is valid AND the model id exists
// by retrieving its metadata.
async function pingOpenAIImage(model: string, key: string) {
  return fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
}

async function pingGoogleImage(model: string, key: string) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${key}`,
  );
}

async function pingOpenRouterImage(model: string, key: string) {
  // OpenRouter doesn't expose a per-model GET, so list and check membership.
  const r = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return r;
  const payload = await r.json().catch(() => ({}));
  const found = (payload?.data ?? []).some((m: any) => m?.id === model);
  if (!found) {
    return new Response(
      JSON.stringify({ error: { message: `Model "${model}" not found on OpenRouter` } }),
      { status: 404 },
    );
  }
  return new Response("{}", { status: 200 });
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
    const kind = (body?.kind === "image" ? "image" : "chat") as Kind;
    if (!model) return json({ error: "Model is required" }, 400);

    const keyName: Record<Provider, string> = {
      openrouter: "OPENROUTER_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
    };
    const key = Deno.env.get(keyName[provider]);
    if (!key) return json({ ok: false, error: `${keyName[provider]} is not configured` }, 200);

    if (kind === "image" && provider === "anthropic") {
      return json({ ok: false, error: "Anthropic does not provide image models" }, 200);
    }

    const t0 = Date.now();
    let r: Response;
    try {
      if (kind === "image") {
        if (provider === "openai") r = await pingOpenAIImage(model, key);
        else if (provider === "google") r = await pingGoogleImage(model, key);
        else if (provider === "openrouter") r = await pingOpenRouterImage(model, key);
        else return json({ ok: false, error: `Unknown provider: ${provider}` }, 200);
      } else {
        if (provider === "openrouter") r = await pingOpenRouterChat(model, key);
        else if (provider === "openai") r = await pingOpenAIChat(model, key);
        else if (provider === "google") r = await pingGoogleChat(model, key);
        else if (provider === "anthropic") r = await pingAnthropicChat(model, key);
        else return json({ ok: false, error: `Unknown provider: ${provider}` }, 200);
      }
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
    }
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      const t = await r.text();
      return json({ ok: false, latency_ms, status: r.status, error: t.slice(0, 400) }, 200);
    }
    await r.text();
    return json({ ok: true, latency_ms, provider, model, kind }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
