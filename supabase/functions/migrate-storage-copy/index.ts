// Edge function: upload a file to a destination bucket using service role.
// POST { bucket, path, source_url }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bucket, path, source_url } = await req.json();
    if (!bucket || !path || !source_url) {
      return new Response(JSON.stringify({ error: "bucket, path, source_url required" }), { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);

    const r = await fetch(source_url);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `download failed ${r.status}` }), { status: 502, headers: corsHeaders });
    }
    const contentType = r.headers.get("content-type") || "application/octet-stream";
    const buf = new Uint8Array(await r.arrayBuffer());

    const { error } = await sb.storage.from(bucket).upload(path, buf, {
      contentType,
      upsert: true,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, size: buf.length }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
