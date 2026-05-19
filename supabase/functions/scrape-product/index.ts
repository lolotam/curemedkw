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

const IMG_RE = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;

// Drop cache-buster query strings (?v=..., ?t=..., resize params, etc.) and any
// URL fragment. Most CDNs (Shopify, WordPress) only use the query for cache
// busting, so the bare URL still serves the same image — and downstream
// consumers (OpenAI image edits, Picsart) get a clean filename to detect MIME
// from the extension.
function stripQuery(u: string): string {
  try {
    const x = new URL(u);
    x.search = "";
    x.hash = "";
    return x.toString();
  } catch {
    return u.split("?")[0].split("#")[0];
  }
}

function collectImages(payload: any): string[] {
  const out = new Set<string>();
  const add = (u: unknown) => {
    if (typeof u !== "string") return;
    if (!/^https?:\/\//i.test(u)) return;
    if (!IMG_RE.test(u)) return;
    out.add(stripQuery(u));
  };

  // From "links" format
  const links: unknown = payload?.links ?? payload?.data?.links;
  if (Array.isArray(links)) links.forEach(add);

  // From rawHtml or html
  const html: string =
    payload?.html ?? payload?.rawHtml ?? payload?.data?.html ?? payload?.data?.rawHtml ?? "";
  if (typeof html === "string" && html) {
    const re = /<img[^>]+src=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) add(m[1]);
  }

  // From markdown image syntax
  const markdown: string = payload?.markdown ?? payload?.data?.markdown ?? "";
  if (typeof markdown === "string" && markdown) {
    const re = /!\[[^\]]*\]\(([^)\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) add(m[1]);
  }

  // OG image fallback
  const og = payload?.metadata?.ogImage ?? payload?.data?.metadata?.ogImage;
  add(og);

  return Array.from(out).slice(0, 12);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify admin
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

    const body = await req.json().catch(() => ({}));
    const url = String(body?.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return json({ error: "Provide a valid http(s) URL" }, 400);

    const endpoint = body?.endpoint === "cloud" ? "cloud" : "self-hosted";

    let fcRes: Response;
    if (endpoint === "cloud") {
      const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
      if (!apiKey) return json({ error: "FIRECRAWL_API_KEY is not configured" }, 500);
      fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "links", "html"],
          onlyMainContent: true,
        }),
      });
    } else {
      const selfHostedUrl =
        Deno.env.get("SELF_HOSTED_FIRECRAWL_URL") ?? "https://firecrawl.curemedkw.com/v1/scrape";
      const selfHostedKey = Deno.env.get("SELF_HOSTED_FIRECRAWL_KEY") ?? "";
      fcRes = await fetch(selfHostedUrl, {
        method: "POST",
        headers: {
          ...(selfHostedKey ? { Authorization: `Bearer ${selfHostedKey}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "links", "html"],
          onlyMainContent: true,
        }),
      });
    }

    if (fcRes.status === 402) {
      return json(
        { error: "Firecrawl credits exhausted. Top up your Firecrawl plan." },
        402,
      );
    }
    if (fcRes.status === 429) {
      return json({ error: "Firecrawl rate limit hit. Try again in a moment." }, 429);
    }
    if (!fcRes.ok) {
      const t = await fcRes.text();
      console.error("Firecrawl error", fcRes.status, t);
      return json({ error: `Firecrawl error (${fcRes.status})` }, 502);
    }

    const payload = await fcRes.json();
    const data = payload?.data ?? payload;
    const markdown: string = data?.markdown ?? "";
    const title: string = data?.metadata?.title ?? "";
    const images = collectImages(payload);

    if (!markdown) return json({ error: "No content extracted from page" }, 422);

    return json({ markdown, title, sourceUrl: url, images });
  } catch (e) {
    console.error("scrape-product error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
