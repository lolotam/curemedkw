# Production Deployment Checklist — Self-hosted Supabase

## 1. Audit results

### Frontend Supabase client usage ✅
All production source files import from `@/integrations/supabase/clientRuntime`. No production file imports the auto-generated `@/integrations/supabase/client` directly (verified via `rg -n "from ['\"]@/integrations/supabase/client['\"]"` → 0 matches). `client.ts` is left untouched (Lovable rule) but unused by the app.

### Storage uploads ✅
All `supabase.storage.from(...)` calls go through the runtime client, so they hit whatever URL `config.js` (or `RUNTIME_SUPABASE_URL`) points at. In production = self-hosted. Files involved:

- `src/lib/heroSlides.ts` → bucket `hero-media` (upload + getPublicUrl)
- `src/lib/db.ts` → buckets `product-images`, `brands-images`, `category-images` (getPublicUrl)
- `src/pages/Account.tsx` → bucket `avatars` (upload)
- `src/components/admin/ProductImportFromUrl.tsx` and editors upload via the same runtime client

No code uses a hardcoded Lovable Cloud URL. ✅

### Edge functions found in `supabase/functions/`

| Function | What it does | Called by prod app? | Required env | verify_jwt |
|---|---|---|---|---|
| `scrape-product` | Firecrawl scrape of a product URL, admin-gated via `user_roles` check | Yes (`src/lib/aiImport.ts` admin import) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY` | disabled in CLI deploy; in-code admin check |
| `extract-product` | LLM (Lovable AI Gateway) extracts structured product fields from markdown | Yes (`src/lib/aiImport.ts`) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` | disabled; in-code auth |
| `translate-product` | Translates product fields to Arabic via Lovable AI | Yes (`AdminProductEditor.tsx`) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` | disabled; in-code auth |
| `openrouter-models` | Lists OpenRouter models for the admin UI | Yes (`src/lib/aiImport.ts`) | `OPENROUTER_API_KEY` | disabled |
| `migrate-storage-copy` | One-shot helper to copy a remote URL into a self-hosted bucket | No (admin/ops only, not invoked by app code) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | disabled |

⚠️ **Missing function**: `src/lib/aiDescription.ts` invokes `rewrite-description`, but there is no `supabase/functions/rewrite-description/`. Either delete the call or add the function — flagging, not fixing in this plan.

## 2. File changes proposed

1. **`scripts/deploy-self-hosted-functions.sh`** — already exists and is correct in shape (loops `supabase functions deploy <name> --no-verify-jwt`). Add a comment block listing the 5 functions explicitly and a pre-flight check that warns if `SUPABASE_AUTH_TOKEN` / `SUPABASE_URL` / `SUPABASE_DB_URL` are unset. Do not change behavior.
2. **`SELF_HOSTED.md`** — rewrite to match the production architecture below (sections A–E, secrets, SSH commands, verification commands, future-migrations rule).
3. No frontend changes. No new browser-side migration runners. No service-role-key exposure.

## 3. New `SELF_HOSTED.md` (sections it will contain)

**A) Dokploy `web` service env vars**
```
RUNTIME_SUPABASE_URL=https://supabase.curemedkw.com
RUNTIME_SUPABASE_ANON_KEY=<self-hosted ANON_KEY>
VITE_SUPABASE_URL=https://supabase.curemedkw.com
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted ANON_KEY>
VITE_SUPABASE_PROJECT_ID=self-hosted-curemed
```

**B) Self-hosted Supabase stack reminders**
- `SITE_URL=https://curemedkw.com`
- `API_EXTERNAL_URL=https://supabase.curemedkw.com`
- `SUPABASE_PUBLIC_URL=https://supabase.curemedkw.com`
- `ADDITIONAL_REDIRECT_URLS=https://curemedkw.com,https://curemedkw.lovable.app,http://localhost:5173`
- Google OAuth: `GOTRUE_EXTERNAL_GOOGLE_ENABLED`, `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`, `GOTRUE_EXTERNAL_GOOGLE_SECRET`, `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.curemedkw.com/auth/v1/callback`
- SMTP (only if email confirm/recovery used): `GOTRUE_SMTP_HOST/PORT/USER/PASS/SENDER_NAME/ADMIN_EMAIL`, `GOTRUE_MAILER_AUTOCONFIRM` as desired
- Kong CORS allowed origins: `https://curemedkw.com`, `https://curemedkw.lovable.app`

**C) Edge Function secrets (names only)**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
LOVABLE_API_KEY
FIRECRAWL_API_KEY
OPENROUTER_API_KEY
```

**D) SSH commands after each Lovable deploy**
```
cd /etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code
bash scripts/apply-self-hosted-migrations.sh
bash scripts/deploy-self-hosted-functions.sh
tail -100 /var/log/curemed-migrations.log
```

**E) Verification commands**
```
docker exec cloud-supabase-hns8fw-supabase-auth env | grep -i GOOGLE
docker exec cloud-supabase-hns8fw-supabase-db psql -U postgres -d postgres \
  -c "SELECT filename, applied_at FROM public.self_hosted_migrations ORDER BY filename DESC LIMIT 10;"
docker logs cloud-supabase-hns8fw-supabase-storage --tail=50
```

**F) Rule for future DB changes**
Always add a new timestamped file under `supabase/migrations/`. Never edit applied ones (the runner enforces a checksum). The cron `/root/run-curemed-migrations.sh` plus `scripts/apply-self-hosted-migrations.sh` will pick them up.

**G) Don't list**
- Don't expose service role in the browser
- Don't dual-write from the browser to two databases
- Don't add a frontend-side migration runner

## 4. Risks / missing info

- **`rewrite-description` function** is invoked by frontend but does not exist in repo → admin "AI rewrite description" button will 404 in both Cloud and self-hosted.
- **Self-hosted CLI auth**: `supabase functions deploy` against a non-managed host requires either `SUPABASE_AUTH_TOKEN` configured in the self-hosted Studio or invoking with `--workdir` and a local config bound to the self-hosted API. Confirm your self-hosted Studio is generating PATs, otherwise we'll deploy functions by `scp`-ing the directory and `docker cp` into the `edge-runtime` container instead — let me know which path you have working.
- **Storage migration**: existing assets in Lovable Cloud buckets won't appear on self-hosted unless copied (use `migrate-storage-copy` or `pg_dump` for `storage.objects` + rclone). Out of scope of this checklist.
- **Anon key swap invalidates sessions**: users will be logged out once after switchover. Expected.
- **Google OAuth client**: must be a different OAuth client whose redirect URI is `https://supabase.curemedkw.com/auth/v1/callback`, otherwise Google login will fail in production.

## Summary
- Files to change: `SELF_HOSTED.md` (rewrite), `scripts/deploy-self-hosted-functions.sh` (small hardening).
- 5 edge functions found; 4 are called from production (`scrape-product`, `extract-product`, `translate-product`, `openrouter-models`); `migrate-storage-copy` is ops-only but should still be deployed.
- Required self-hosted secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `LOVABLE_API_KEY`, `FIRECRAWL_API_KEY`, `OPENROUTER_API_KEY`.
- SSH steps documented in section D above.
