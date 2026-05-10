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

const STANDARD_FACTORS = new Set([2, 4, 6, 8]);
const ULTRA_FACTORS = new Set([2, 4, 6, 8, 16]);

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

    const apiKey = Deno.env.get("PICSART_API_KEY");
    if (!apiKey) return json({ error: "PICSART_API_KEY is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const imageUrl = String(body?.imageUrl ?? "").trim();
    const mode = body?.mode === "ultra" ? "ultra" : "standard";
    const factor = Number(body?.factor);
    const format = ["JPG", "PNG", "WEBP"].includes(body?.format) ? body.format : "JPG";

    if (!/^https?:\/\//i.test(imageUrl)) {
      return json({ error: "Provide a valid http(s) imageUrl" }, 400);
    }
    const allowed = mode === "ultra" ? ULTRA_FACTORS : STANDARD_FACTORS;
    if (!allowed.has(factor)) {
      return json({ error: `Invalid factor for ${mode} mode` }, 400);
    }

    // Fetch source image
    const srcResp = await fetch(imageUrl);
    if (!srcResp.ok) return json({ error: `Failed to fetch source image (${srcResp.status})` }, 400);
    const srcBlob = await srcResp.blob();

    // Build multipart form for Picsart
    const fd = new FormData();
    fd.append("upscale_factor", String(factor));
    fd.append("format", format);
    if (mode === "ultra") fd.append("mode", "sync");
    fd.append("image", srcBlob, "source");

    const endpoint =
      mode === "ultra"
        ? "https://api.picsart.io/tools/1.0/upscale/ultra"
        : "https://api.picsart.io/tools/1.0/upscale";

    const picsartResp = await fetch(endpoint, {
      method: "POST",
      headers: { "X-Picsart-API-Key": apiKey, accept: "application/json" },
      body: fd,
    });

    const picsartJson = await picsartResp.json().catch(() => ({}));
    if (!picsartResp.ok) {
      return json(
        { error: picsartJson?.message || `Picsart error ${picsartResp.status}`, details: picsartJson },
        picsartResp.status,
      );
    }

    const resultUrl: string | undefined = picsartJson?.data?.url;
    if (!resultUrl) return json({ error: "Picsart did not return an image URL", details: picsartJson }, 502);

    // Re-host the result in our bucket so it doesn't expire
    const resultResp = await fetch(resultUrl);
    if (!resultResp.ok) return json({ error: "Failed to download Picsart result" }, 502);
    const resultBytes = new Uint8Array(await resultResp.arrayBuffer());
    const ext = format.toLowerCase() === "jpg" ? "jpg" : format.toLowerCase();
    const contentType =
      ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp";
    const path = `upscaled/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from("product-images")
      .upload(path, resultBytes, { contentType, upsert: false });
    if (uploadErr) return json({ error: `Upload failed: ${uploadErr.message}` }, 500);

    const { data: pub } = admin.storage.from("product-images").getPublicUrl(path);

    return json({
      url: pub.publicUrl,
      originalUrl: imageUrl,
      mode,
      factor,
      format,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
