# Self-hosted Supabase deployment

The frontend is wired to read its Supabase URL + anon key from `/config.js`
at runtime (see `src/integrations/supabase/clientRuntime.ts`). The same
Docker image therefore runs against either Lovable Cloud (preview) or the
self-hosted Supabase stack, depending only on what `config.js` contains.

## 1. Dokploy `web` service env

Set on the deployed frontend container:

```
RUNTIME_SUPABASE_URL=https://supabase.curemedkw.com
RUNTIME_SUPABASE_ANON_KEY=<your self-hosted ANON_KEY>
```

`docker/start-nginx.sh` rewrites `/usr/share/nginx/html/config.js` from
these vars on every container start.

The Lovable preview keeps using Lovable Cloud because `public/config.js`
ships with empty values and falls back to the `VITE_SUPABASE_*` build vars.

## 2. Self-hosted Supabase stack env

Required on the Supabase `gotrue` / Kong containers:

```
SITE_URL=https://curemedkw.com
ADDITIONAL_REDIRECT_URLS=https://curemedkw.lovable.app,http://localhost:5173
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
```

CORS allowed origins on Kong: `https://curemedkw.com`,
`https://curemedkw.lovable.app`.

For Google login, create a Google OAuth client whose authorised redirect
URI is `https://supabase.curemedkw.com/auth/v1/callback`, then set:

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.curemedkw.com/auth/v1/callback
```

## 3. Apply schema + RLS + storage buckets

All tables, policies, the `handle_new_user` trigger, and the public
storage buckets live in `supabase/migrations/`. Apply them once:

```
bash scripts/apply-self-hosted-migrations.sh
```

(Override `SUPABASE_DB_CONTAINER` if your Postgres container has a
different name.)

## 4. Function secrets on self-hosted

The edge functions read these at runtime — set them as function secrets
on the self-hosted stack:

```
SUPABASE_URL=https://supabase.curemedkw.com
SUPABASE_SERVICE_ROLE_KEY=<self-hosted SERVICE_ROLE_KEY>
LOVABLE_API_KEY=<copy from Lovable Cloud>
FIRECRAWL_API_KEY=<copy from Lovable Cloud>
OPENROUTER_API_KEY=<copy from Lovable Cloud>
```

## 5. Deploy edge functions

```
export SUPABASE_URL=https://supabase.curemedkw.com
export SUPABASE_AUTH_TOKEN=<dashboard PAT>
export SUPABASE_DB_URL=postgres://postgres:<POSTGRES_PASSWORD>@supabase.curemedkw.com:5432/postgres
bash scripts/deploy-self-hosted-functions.sh
```

## 6. (Optional) copy data from Lovable Cloud

```
pg_dump --data-only --schema=public \
  "$LOVABLE_CLOUD_DB_URL" \
  | psql "$SELF_HOSTED_DB_URL"
```

For storage objects, the existing `migrate-storage-copy` edge function
can be looped over each bucket/object pair.

---

## Security notes

- Browser only ever sees `ANON_KEY`. Never put `SERVICE_ROLE_KEY`,
  `JWT_SECRET`, `POSTGRES_PASSWORD`, `SECRET_KEY_BASE` or `VAULT_ENC_KEY`
  in any frontend file or in `RUNTIME_*` env vars on the `web` container.
- Switching `RUNTIME_SUPABASE_URL` invalidates all existing sessions
  (different JWT issuer). Users will need to sign in again. Expected.
- `src/integrations/supabase/types.ts` is generated against Lovable Cloud
  and stays valid as long as the self-hosted DB is kept in sync via
  `supabase/migrations/`. Do not edit that file manually.
