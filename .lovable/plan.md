# Diagnosis: Both errors are on your self-hosted Supabase

`public/config.js` points the app at `https://supabase.curemedkw.com`. Every
edge function call (test-connection, upscale-image-ai, scrape-product) goes to
that host — **not** Lovable Cloud. So the secrets shown in Lovable's panel
(ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.) are irrelevant to what actually runs
in production.

---

## Error 1 — Anthropic "Edge Function returned a non-2xx status code"

`supabase/functions/ai-test-connection/index.ts` is written correctly: when a
provider key is missing, it returns **HTTP 200** with `{ ok:false, error:"ANTHROPIC_API_KEY is not configured" }`.

A **non-2xx** therefore means one of:

1. **The deployed version on `supabase.curemedkw.com` is older** and doesn't
   know the `"anthropic"` provider yet (returns 500 from an unhandled branch,
   or 404 because the route is missing).
2. **The function is crashing at boot** on the self-hosted edge runtime
   (missing `SUPABASE_SERVICE_ROLE_KEY` env var → `createClient` throws → 500).
3. **CORS/proxy 502** from your nginx in front of `edge-runtime`.

### How to confirm

On your self-hosted box:

```bash
# 1. Check what version is deployed
supabase functions list --project-ref <self-hosted-ref>

# 2. Check live logs while you click "Test connection" again
docker logs -f supabase-edge-functions
# or: supabase functions logs ai-test-connection

# 3. Confirm env vars present in the edge runtime container
docker exec supabase-edge-functions env | grep -E 'ANTHROPIC|SUPABASE_(URL|SERVICE)'
```

### Fix

```bash
# From the project root, against the self-hosted instance:
supabase functions deploy ai-test-connection \
  --project-ref <self-hosted-ref> --no-verify-jwt=false

# Make sure ANTHROPIC_API_KEY is set in the edge-runtime container:
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <self-hosted-ref>
# OR add to docker-compose env for the edge-runtime service and restart:
docker compose restart edge-runtime
```

If after redeploy you still see non-2xx, the docker logs will show the exact
stack trace — paste it back to me.

---

## Error 2 — Upscale "Failed to send a request to the Edge Function"

This phrasing comes from `supabase-js` when the **fetch itself fails before a
response is received** (network error, CORS rejection, 502 from proxy, or
function not deployed). It is *different* from "non-2xx status code".

Most likely causes on self-hosted:

1. **`upscale-image-ai` is not deployed** on `supabase.curemedkw.com` (the
   recent timeout/budget refactor only lives in your repo, not on the server).
2. **nginx/Cloudflare in front of the edge runtime closes the connection**
   before the function returns. Image upscaling can take 30–90s; if your proxy
   has a `proxy_read_timeout` of 30s, the browser sees a network error.
3. **CORS preflight fails** because the deployed function doesn't include the
   `Access-Control-Allow-*` headers (older version).

### How to confirm

```bash
# Open DevTools → Network → click the upscale button.
# Look at the request to /functions/v1/upscale-image-ai
#   - Status "(failed) net::ERR_FAILED"  →  CORS or proxy killed it
#   - Status 504 / 502                    →  nginx timeout
#   - Status 404                          →  function not deployed
#   - No request at all (only OPTIONS)    →  CORS preflight failed
```

Also check:

```bash
docker logs -f supabase-edge-functions | grep upscale
curl -i https://supabase.curemedkw.com/functions/v1/upscale-image-ai \
  -X OPTIONS -H "Origin: https://curemedkw.lovable.app" \
  -H "Access-Control-Request-Method: POST"
```

### Fix

```bash
# 1. Deploy the latest version (with the 35s/85s budget fix already in repo)
supabase functions deploy upscale-image-ai --project-ref <self-hosted-ref>

# 2. Make sure provider keys exist in the edge-runtime env:
supabase secrets set OPENAI_API_KEY=... GOOGLE_API_KEY=... \
  OPENROUTER_API_KEY=... PICSART_API_KEY=... --project-ref <self-hosted-ref>

# 3. Bump nginx timeouts in front of supabase.curemedkw.com:
#    location /functions/ {
#      proxy_read_timeout   120s;
#      proxy_send_timeout   120s;
#      proxy_connect_timeout 30s;
#    }
#    Then: nginx -s reload
```

---

## Is the issue on the self-hosting side?  →  **Yes, almost certainly**

Both symptoms map cleanly to:

- Outdated function code on the self-hosted edge runtime, **and/or**
- Missing provider API keys in the edge-runtime container env, **and/or**
- nginx in front of `supabase.curemedkw.com` killing long requests.

Nothing in the source code in this repo is currently broken in a way that
would explain the screenshots. The fix is **deployment + server config**, not
a code change.

---

## What I need from you to go further

If after redeploying + setting env vars + bumping nginx timeouts the errors
persist, send me:

1. Output of `docker logs supabase-edge-functions --tail=200` right after
   reproducing each error.
2. The full DevTools → Network entry (status code + response body) for the
   failing `/functions/v1/ai-test-connection` and
   `/functions/v1/upscale-image-ai` calls.
3. Confirmation that `ANTHROPIC_API_KEY` (and the upscale provider keys) are
   visible inside the edge-runtime container (`docker exec ... env | grep ...`).

With those three, I can tell you exactly which line/config to change. No
client-side code changes are warranted yet.
