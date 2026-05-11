
# Self-hosted Supabase — full integration plan

## Verified during this planning pass

- `src/integrations/supabase/clientRuntime.ts` prefers
  `window.__APP_CONFIG__.SUPABASE_URL` / `SUPABASE_ANON_KEY`, then falls
  back to `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. ✅
- `public/config.js` exists with empty values, so Lovable preview falls
  back to Lovable Cloud automatically. ✅
- `index.html` loads `/config.js` (line 51) **before** `/src/main.tsx`
  (line 52), so `window.__APP_CONFIG__` is set before React boots. ✅
- Repo grep `from "@/integrations/supabase/client"` returns only a
  comment inside the auto-generated `client.ts`. **Every app file already
  uses `clientRuntime.ts`** — nothing left to rewire. ✅
- `Dockerfile` accepts `VITE_*` build args; `docker/start-nginx.sh`
  rewrites `/usr/share/nginx/html/config.js` from `RUNTIME_SUPABASE_URL`
  / `RUNTIME_SUPABASE_ANON_KEY` on every container start. ✅
- `scripts/apply-self-hosted-migrations.sh` and
  `scripts/deploy-self-hosted-functions.sh` exist and are idempotent.
  `SELF_HOSTED.md` already documents env vars, CORS, OAuth, and edge
  function secret passthrough. ✅

So this is a **deploy-only** task — no source-code changes are required
from Lovable for the integration itself.

---

## Responsibility split

### Lovable owns (code in this repo)
- Frontend source code, including using `clientRuntime.ts` everywhere
  (already done; will keep it that way for any new files).
- Migration SQL files in `supabase/migrations/` (timestamped, idempotent,
  never edited after being applied).
- Edge function source under `supabase/functions/<name>/index.ts`.
- Deployment helper scripts in `scripts/`.
- `Dockerfile`, `docker-compose.yml`, `docker/start-nginx.sh`,
  `nginx.conf`, `public/config.js`.

### Dokploy / the server owns (runtime)
- Building and serving the frontend container (`web` service).
- Writing `/usr/share/nginx/html/config.js` at container startup from the
  `RUNTIME_*` env vars.
- Applying migrations to the self-hosted Supabase database via the
  apply-script.
- Deploying edge functions into the self-hosted Supabase `functions`
  container via the deploy-script.
- Providing runtime secrets to the Supabase stack
  (`/etc/dokploy/compose/cloud-supabase-hns8fw/code/.env` + `functions:`
  service `environment:` passthrough in that compose file).

---

## One-time setup the server admin must do

### 1. Dokploy `web` service env vars
```
RUNTIME_SUPABASE_URL=https://supabase.curemedkw.com
RUNTIME_SUPABASE_ANON_KEY=<self-hosted ANON key>

VITE_SUPABASE_URL=https://supabase.curemedkw.com
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted ANON key>
VITE_SUPABASE_PROJECT_ID=self-hosted-curemed
```
`RUNTIME_*` → injected into `/config.js` at container start.
`VITE_*` → baked into the bundle at `docker build` (Dockerfile ARGs) as
the fallback.

### 2. Self-hosted GoTrue / Kong env

Use the actual env names from the current Supabase compose. In most
self-hosted Supabase stacks these are the canonical `GOTRUE_*` names:

```
GOTRUE_SITE_URL=https://curemedkw.com
GOTRUE_URI_ALLOW_LIST=https://curemedkw.com,https://curemedkw.lovable.app,http://localhost:5173
```

Keep these only if the compose file already exposes them (some stacks
use the un-prefixed aliases instead):
```
SITE_URL=...
ADDITIONAL_REDIRECT_URLS=...
```

Kong CORS allowed origins:
`https://curemedkw.com`, `https://curemedkw.lovable.app`.

If Google sign-in is in use, register a separate Google OAuth client
whose redirect URI is `https://supabase.curemedkw.com/auth/v1/callback`
and set the `GOTRUE_EXTERNAL_GOOGLE_*` vars (see `SELF_HOSTED.md` §B).

### 3. Edge function secrets on the Supabase stack

In `/etc/dokploy/compose/cloud-supabase-hns8fw/code/.env`:
```
OPENROUTER_API_KEY=...
FIRECRAWL_API_KEY=...
LOVABLE_API_KEY=...
PICSART_API_KEY=...
```

Also verify the `functions` service has access to:
```
SUPABASE_URL=http://kong:8000
SUPABASE_ANON_KEY=<self-hosted ANON key>
SUPABASE_SERVICE_ROLE_KEY=<self-hosted SERVICE ROLE key>
```

These must live **only** inside the Supabase / functions backend
environment — never in the frontend `RUNTIME_*` or `VITE_*` vars.

Then ensure all of those names appear under
`services.functions.environment:` in the same directory's
`docker-compose.yml`. Without that passthrough, `Deno.env.get(...)`
returns `undefined` inside the functions. Redeploy the Supabase stack so
the `functions` container picks them up.

---

## After EVERY Lovable change that touches DB or edge functions

Lovable can create/update migration files and edge function source code,
but self-hosted Supabase deployment happens **only** when the server
scripts are run — manually via SSH or through a post-deploy automation /
cron.

Manual command set:
```bash
cd /etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code
bash scripts/apply-self-hosted-migrations.sh
bash scripts/deploy-self-hosted-functions.sh
tail -100 /var/log/curemed-migrations.log
```
The migration runner is idempotent: it tracks each file's sha256 in
`public.self_hosted_migrations`, skips already-applied files, and aborts
if a previously-applied file's checksum changed.

Frontend-only Lovable changes (no DB, no edge functions) need only a
Dokploy `web` redeploy — no scripts to run.

---

## Verification in browser

Open `https://curemedkw.com` → devtools console must show:
```
[supabase] using URL: https://supabase.curemedkw.com
```
Network tab: every Supabase request goes to `supabase.curemedkw.com` and
none to `lgcuwsjlxkntwzlgjtzp.supabase.co`. Then sanity-test:
- Sign up / sign in (email + Google if configured).
- `/admin` login + admin pages render.
- A category page (e.g. `/categories/deodorant`) renders products.
- An admin AI import action succeeds (proves edge functions and their
  third-party secrets are wired).

---

## Hard rules

- Browser only ever sees the ANON key. Never put `SERVICE_ROLE_KEY`,
  `JWT_SECRET`, `POSTGRES_PASSWORD`, `SECRET_KEY_BASE`, or `VAULT_ENC_KEY`
  in `RUNTIME_*` or `VITE_*`.
- Never edit `src/integrations/supabase/client.ts` or `types.ts` —
  Lovable-managed; the runtime client routes around them.
- Never edit `public/config.js` in the repo to hard-code self-hosted
  URLs; the Lovable preview must keep empty values to stay on Lovable
  Cloud.
- Never edit a migration after it's been applied — add a new timestamped
  file instead.

---

## Out of scope (ask separately if needed)

- One-time data copy from Lovable Cloud → self-hosted via
  `pg_dump --data-only --schema=public`.
- One-time storage object copy via the `migrate-storage-copy` edge function.
