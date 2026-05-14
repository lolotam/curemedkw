## Diagnosis

Both errors come from edge functions running on `https://supabase.curemedkw.com` (self-hosted), not from the frontend. The frontend, REST/PostgREST and Auth are working fine — only the two AI-heavy functions fail.

### What I verified

1. **CORS / preflight is OK on self-hosted** — `OPTIONS /functions/v1/scrape-product` and `OPTIONS /functions/v1/upscale-image-ai` both return `200` with `access-control-allow-origin: *`. So the issue is not CORS misconfiguration.
2. **Functions ARE deployed on self-hosted** — they respond with their own JSON error bodies (`{"error":"Missing Authorization header"}`, `{"error":"Unauthorized"}`), which is code from `scrape-product/index.ts` and `upscale-image-ai/index.ts` running on Kong/edge-runtime at `supabase.curemedkw.com`.
3. **Auth model in those functions** — both call `admin.auth.getUser(token)` against `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env. Then they require an `admin` row in `user_roles`. The browser request DOES include a valid user Bearer token issued by self-hosted GoTrue, so this check should pass for the logged-in admin user.

### Why each error happens

**A. `scrape-product` → "Edge Function returned a non-2xx status code"**
The browser actually receives an HTTP response (4xx/5xx) — that's what supabase-js wraps as "non-2xx". Most likely causes on self-hosted, in order of likelihood:

1. `FIRECRAWL_API_KEY` is **not set** in the self-hosted edge runtime env → function returns 500 / 400.
2. `SUPABASE_SERVICE_ROLE_KEY` on self-hosted edge runtime doesn't match the JWT secret used by GoTrue → `admin.auth.getUser(token)` fails → 401 even for a valid user.
3. The user row isn't in `public.user_roles` with `role='admin'` on the self-hosted DB (data wasn't migrated for this user) → 403.

**B. `upscale-image-ai` → "Failed to fetch"** (no HTTP status at all)
"Failed to fetch" with no status means the browser never saw a response — preflight is fine, so it's almost certainly **the function exceeding the upstream timeout**:

- Cloudflare in front of `supabase.curemedkw.com` has a hard ~100s timeout.
- This function downloads the image, calls OpenAI/Gemini/OpenRouter (each up to 120s — see `PROVIDER_TIMEOUT_MS = 120_000`), uploads to storage, and returns. Easily >100s on first model.
- When Cloudflare times out, it drops the connection without CORS headers → browser reports `TypeError: Failed to fetch`.
- A secondary cause would be one of `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY` missing on self-hosted, but that would return 500, not "Failed to fetch".

### What this is NOT

- Not a Lovable-vs-self-hosted client config issue. `public/config.js` correctly points at `https://supabase.curemedkw.com` and the user's session is authenticated against it.
- Not a CORS bug in the function source.

---

## Plan to fix

### Step 1 — Confirm secrets on the self-hosted stack (you, on the server)

On the Dokploy/self-hosted Supabase host, check the edge-runtime container env actually has:

```
SUPABASE_URL=https://supabase.curemedkw.com
SUPABASE_SERVICE_ROLE_KEY=<self-hosted service role>
SUPABASE_ANON_KEY=<self-hosted anon>
FIRECRAWL_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=...
PICSART_API_KEY=...   (used by upscale-image)
```

The Lovable Cloud "secrets" panel listed in this prompt is **not** what these functions read at runtime — they read the self-hosted edge-runtime env. After updating, restart the `functions` / `edge-runtime` container so values reload.

### Step 2 — Confirm the admin row exists on self-hosted

Run on the self-hosted DB (SQL editor of self-hosted Studio):

```sql
select role from public.user_roles
where user_id = 'b1c2de5a-1134-4b3a-8691-9ff7b73b1221';
```

If empty, insert `('b1c2de5a-1134-4b3a-8691-9ff7b73b1221','admin')`.

### Step 3 — Reproduce `scrape-product` with detailed status

After Steps 1–2, retry Add Product → Scrape. If it still fails, capture the response body from DevTools Network tab. The function returns structured JSON like `{ error: "FIRECRAWL_API_KEY not configured" }` or `{ error: "Admin only" }` — that pinpoints the remaining cause exactly.

### Step 4 — Fix `upscale-image-ai` timeout (code change in next build mode)

Two options, in order of preference:

1. **Lower per-provider timeout and run providers in parallel race**, so the function returns within ~60s. Change `PROVIDER_TIMEOUT_MS` from `120_000` to `45_000`, and use `Promise.any` over the chain instead of sequential fallback.
2. **Convert to background job** — insert a row in a new `image_jobs` table, call `EdgeRuntime.waitUntil(processJob(...))`, return `{ job_id }` immediately. Frontend polls `image_jobs` until `status='complete'`. This is the robust fix; it removes any edge timeout from the user path.

I recommend option 1 first (small change, no DB migration, often enough), and only do option 2 if it still times out.

### Step 5 — Optional: verify with a direct curl using a real user token

Once Steps 1–2 are done, paste the user's Bearer token from DevTools and run:

```bash
curl -i -X POST https://supabase.curemedkw.com/functions/v1/scrape-product \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "apikey: <ANON>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://pharmazone.com/products/..."}'
```

A successful path returns `200` with `{ images: [...] }`. Any other status comes back with a JSON `error` field that tells us exactly which check failed.

---

## Notes / non-goals

- We will keep all client config pointing at self-hosted (`public/config.js` stays as-is).
- No Lovable Cloud secret changes are needed — these functions only read self-hosted env vars now.
- No frontend behavior changes for scrape; only `upscale-image-ai/index.ts` may be edited (Step 4 option 1) when you switch out of plan mode.

Tell me which step you want me to start with after you've confirmed Steps 1–2 on the server (or if you want me to just go ahead and apply Step 4 option 1 now).