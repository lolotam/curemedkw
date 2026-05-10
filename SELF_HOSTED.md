# Self-hosted Supabase — Production Deployment Checklist

Production architecture:

- Lovable preview/dev → Lovable Cloud Supabase (unchanged).
- Production site **curemedkw.com** → self-hosted Supabase only at
  `https://supabase.curemedkw.com`.
- Frontend chooses backend at runtime via `/config.js` consumed by
  `src/integrations/supabase/clientRuntime.ts`. All app code imports the
  runtime client; the auto-generated `client.ts` is untouched.
- Self-hosted Postgres container: `cloud-supabase-hns8fw-supabase-db`
- Dokploy app code path: `/etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code`

---

## A) Dokploy `web` service env vars

Set on the deployed frontend container:

```
RUNTIME_SUPABASE_URL=https://supabase.curemedkw.com
RUNTIME_SUPABASE_ANON_KEY=<self-hosted ANON_KEY>
VITE_SUPABASE_URL=https://supabase.curemedkw.com
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted ANON_KEY>
VITE_SUPABASE_PROJECT_ID=self-hosted-curemed
```

`docker/start-nginx.sh` rewrites `/usr/share/nginx/html/config.js` from the
`RUNTIME_*` vars on every container start. The `VITE_*` vars are baked in at
build time as a fallback.

The Lovable preview keeps using Lovable Cloud because `public/config.js`
ships with empty values and Lovable injects its own `VITE_SUPABASE_*`.

---

## B) Self-hosted Supabase stack env reminders

Set on the self-hosted GoTrue / Kong / Studio containers:

```
SITE_URL=https://curemedkw.com
API_EXTERNAL_URL=https://supabase.curemedkw.com
SUPABASE_PUBLIC_URL=https://supabase.curemedkw.com
ADDITIONAL_REDIRECT_URLS=https://curemedkw.com,https://curemedkw.lovable.app,http://localhost:5173
```

Kong CORS allowed origins: `https://curemedkw.com`,
`https://curemedkw.lovable.app`.

### Google OAuth (separate client from Lovable Cloud)

Create a Google OAuth client whose authorised redirect URI is
`https://supabase.curemedkw.com/auth/v1/callback`, then set:

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.curemedkw.com/auth/v1/callback
```

### SMTP (only if email confirm / recovery is required)

```
GOTRUE_SMTP_HOST=...
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=...
GOTRUE_SMTP_PASS=...
GOTRUE_SMTP_SENDER_NAME=Curemed
GOTRUE_SMTP_ADMIN_EMAIL=admin@curemedkw.com
GOTRUE_MAILER_AUTOCONFIRM=false   # true to skip email verification
```

---

## C) Edge Function secrets (names only — set on the self-hosted stack)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
LOVABLE_API_KEY
FIRECRAWL_API_KEY
OPENROUTER_API_KEY
```

Functions deployed and what each needs:

| Function | Used in prod | Secrets |
|---|---|---|
| `scrape-product` | yes (admin AI import) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY` |
| `extract-product` | yes (admin AI import) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` |
| `translate-product` | yes (admin product editor) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` |
| `openrouter-models` | yes (admin) | `OPENROUTER_API_KEY` |
| `migrate-storage-copy` | ops only | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

All functions deploy with `--no-verify-jwt` and perform their own auth
(Authorization header + `has_role('admin')` where appropriate).

---

## D) SSH commands to run on the server after each Lovable deploy

```bash
cd /etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code
bash scripts/apply-self-hosted-migrations.sh
bash scripts/deploy-self-hosted-functions.sh
tail -100 /var/log/curemed-migrations.log
```

The migration runner is idempotent (it tracks applied files in
`public.self_hosted_migrations` with a sha256 checksum, so re-runs are safe
and editing an already-applied migration is rejected).

---

## E) Verification commands

```bash
# Confirm Google OAuth env reached gotrue
docker exec cloud-supabase-hns8fw-supabase-auth env | grep -i GOOGLE

# Confirm latest migrations are applied
docker exec cloud-supabase-hns8fw-supabase-db psql -U postgres -d postgres \
  -c "SELECT filename, applied_at FROM public.self_hosted_migrations ORDER BY filename DESC LIMIT 10;"

# Inspect recent storage activity
docker logs cloud-supabase-hns8fw-supabase-storage --tail=50
```

---

## F) Future database changes

Always create a new timestamped SQL file in `supabase/migrations/`
(e.g. `20260101120000_add_xyz.sql`). Never edit an already-applied
migration — the runner's checksum guard will refuse it. The cron
`/root/run-curemed-migrations.sh` plus
`scripts/apply-self-hosted-migrations.sh` apply new files automatically on
the next pass.

Do **not** rely on Lovable Cloud's migration system for production state —
only files committed under `supabase/migrations/` will reach the
self-hosted database.

---

## G) Hard rules

- Browser only ever sees `ANON_KEY`. **Never** put `SERVICE_ROLE_KEY`,
  `JWT_SECRET`, `POSTGRES_PASSWORD`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, or
  any other secret in frontend code or in `RUNTIME_*` env vars on the
  `web` container.
- Production must use self-hosted Supabase only. Do **not** dual-write
  from the browser to two databases, and do **not** add a frontend-side
  migration runner.
- Switching `RUNTIME_SUPABASE_URL` invalidates existing sessions
  (different JWT issuer). Users will need to sign in again. Expected.
- `src/integrations/supabase/types.ts` is generated against Lovable Cloud
  but stays valid as long as the self-hosted DB is kept in sync via
  `supabase/migrations/`. Do not edit it manually.

---

## (Optional) one-time data + storage copy from Lovable Cloud

```bash
pg_dump --data-only --schema=public \
  "$LOVABLE_CLOUD_DB_URL" \
  | psql "$SELF_HOSTED_DB_URL"
```

For storage objects, loop the `migrate-storage-copy` edge function over
each `(bucket, path, source_url)` triple from the Lovable Cloud
`storage.objects` table.

---

## H) Self-hosted Edge Functions secrets in Dokploy Supabase stack

The deployed edge functions (`extract-product`, `translate-product`,
`scrape-product`, `openrouter-models`) read their third-party API keys from
the **Supabase stack's** environment — not from the frontend `web`
container. These must be configured in two places on the server.

### 1. Add the secrets to the Supabase stack `.env`

File:

```
/etc/dokploy/compose/cloud-supabase-hns8fw/code/.env
```

Required env names:

```
OPENROUTER_API_KEY=...
FIRECRAWL_API_KEY=...
LOVABLE_API_KEY=...
```

### 2. Pass them into the `functions` service in `docker-compose.yml`

The Supabase stack's `docker-compose.yml` (same directory as the `.env`
above) must forward these variables into the `functions` service's
`environment:` block:

```yaml
services:
  functions:
    environment:
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      FIRECRAWL_API_KEY: ${FIRECRAWL_API_KEY}
      LOVABLE_API_KEY: ${LOVABLE_API_KEY}
```

Without this passthrough the keys exist in `.env` but
`Deno.env.get("OPENROUTER_API_KEY")` (etc.) inside the functions returns
`undefined`, and AI / scraping calls will fail at runtime.

After editing either file, redeploy the Supabase stack from Dokploy so the
`functions` container is recreated with the new env.

### 3. Warning — keep this as recovery documentation

Normal CureMed frontend auto-deploy will **not** overwrite the Supabase
stack compose file or its `.env`. However, recreating or updating the
Supabase stack **template** in Dokploy may overwrite
`/etc/dokploy/compose/cloud-supabase-hns8fw/code/docker-compose.yml` and
drop these env passthroughs. If AI features suddenly stop working after a
Supabase stack template update, re-apply both steps above.

### 4. Security

These keys are **server-side only**. Never put them in:

- frontend source code,
- `RUNTIME_SUPABASE_*` vars on the `web` container,
- `VITE_*` build args,
- or anything that ends up in the browser bundle.
