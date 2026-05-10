## Goal

Point the deployed app at the self-hosted Supabase stack at `https://supabase.curemedkw.com` while keeping the Lovable preview working against Lovable Cloud. Same code, different `/config.js` per environment.

## What you just shared

- Host: `supabase.curemedkw.com`
- `ANON_KEY` (safe in browser) — will be served via `/config.js` at runtime
- `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY` — **server-side only**, never ship to the browser. Keep them in Dokploy env for the Supabase stack itself; do not paste them anywhere in the frontend repo.

The runtime client (`src/integrations/supabase/clientRuntime.ts`) is already wired to read `window.__APP_CONFIG__` from `/config.js`, falling back to Vite env vars. So the frontend wiring is already done — what's missing is (1) make sure every caller uses `clientRuntime`, (2) ship the right `config.js` to Dokploy, (3) get schema + storage into the self-hosted DB.

## Plan

### 1. Frontend: route every caller through `clientRuntime`

Audit and switch any remaining `from "@/integrations/supabase/client"` imports to `from "@/integrations/supabase/clientRuntime"` so the same build can target either backend. The auto-generated `client.ts` stays untouched (Lovable rule).

Files known to already use runtime client: `src/lib/auth.tsx`. Will grep the rest and convert.

### 2. Dokploy runtime config

In Dokploy, set on the `web` service:

```
RUNTIME_SUPABASE_URL=https://supabase.curemedkw.com
RUNTIME_SUPABASE_ANON_KEY=<the ANON_KEY you pasted>
```

`docker/start-nginx.sh` already writes these into `/usr/share/nginx/html/config.js` at container start. Lovable preview keeps using Vite env vars (Lovable Cloud) because `config.js` values are empty there.

### 3. Self-hosted Supabase: schema + auth + storage parity

Produce a single `scripts/self-hosted/001_baseline.sql` containing the current Lovable Cloud schema:

- enum `app_role`
- tables: `profiles`, `user_roles`, `products`, `orders`, … (full `public` schema)
- functions: `has_role`, `next_order_number`, `update_updated_at_column`, `handle_new_user`
- the `on_auth_user_created` trigger on `auth.users` calling `handle_new_user`
- all RLS policies
- storage buckets: `hero-media`, `product-images`, `category-images`, `buket-images`, `brands-images`, `favicone`, `avatars` (all public) + matching `storage.objects` policies
- sequence `order_number_seq`

You run it once against self-hosted via `psql "postgres://postgres:<POSTGRES_PASSWORD>@supabase.curemedkw.com:5432/postgres" -f 001_baseline.sql` (or via Studio SQL editor). `scripts/apply-self-hosted-migrations.sh` already exists — I'll update it to apply this baseline first.

### 4. Self-hosted Supabase: required runtime config

In the self-hosted stack's env (Dokploy → supabase service):

- `SITE_URL=https://curemedkw.com` (or your prod domain)
- `ADDITIONAL_REDIRECT_URLS=https://curemedkw.lovable.app,http://localhost:5173`
- GoTrue/Kong CORS: allow origins `https://curemedkw.com`, `https://curemedkw.lovable.app`
- Enable Email provider; add Google OAuth client if you want Google login (separate Google Cloud OAuth client whose redirect URI is `https://supabase.curemedkw.com/auth/v1/callback`)
- Disable "auto-confirm signups" unless you want it on

### 5. Edge Functions on self-hosted

The functions in `supabase/functions/*` reference `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `FIRECRAWL_API_KEY`. On self-hosted you must set those as function secrets:

- `SUPABASE_URL=https://supabase.curemedkw.com`
- `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>`
- `LOVABLE_API_KEY=<copy from Lovable Cloud>`
- `FIRECRAWL_API_KEY=<copy from Lovable Cloud>`

Deploy with the self-hosted CLI: `supabase functions deploy scrape-product translate-product migrate-storage-copy extract-product openrouter-models --project-ref <self-hosted-ref>` (or your stack's equivalent). I'll add a `scripts/self-hosted/deploy-functions.sh` helper.

### 6. Data + storage migration (optional, one-time)

If you want existing Lovable Cloud data on self-hosted:

- Schema-only is already in step 3. For data: `pg_dump --data-only --schema=public <lovable-cloud-db-url> | psql <self-hosted-db-url>`
- For storage objects: a small Node script that lists each bucket on Lovable Cloud, downloads each object, and re-uploads to self-hosted using the existing `migrate-storage-copy` pattern. I'll add `scripts/self-hosted/copy-storage.ts`.

If you just want to start fresh on self-hosted, skip this step.

## Technical notes

- Browser only ever sees `ANON_KEY`. `SERVICE_ROLE_KEY` stays in edge functions / scripts.
- `src/integrations/supabase/types.ts` is generated against Lovable Cloud's schema. As long as self-hosted runs the same baseline SQL the types stay valid; do not edit that file.
- After switching `RUNTIME_SUPABASE_URL`, every signed-in user will be logged out (different JWT issuer). Expected.
- Realtime, Storage public URLs, and edge function URLs will all be on `supabase.curemedkw.com` automatically because they derive from `SUPABASE_URL`.

## What I need from you to start building

1. Confirm the deployed site (Dokploy) should hit self-hosted, while Lovable preview keeps hitting Lovable Cloud — yes/no.
2. Do you want me to (a) generate the baseline SQL only, or (b) also write the data + storage copy scripts?
3. Is the self-hosted Supabase already running and reachable at `https://supabase.curemedkw.com` (Studio loads, `/auth/v1/health` returns 200)?
