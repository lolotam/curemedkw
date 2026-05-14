## Goal

Switch the frontend (Lovable preview, lovable.app, Dokploy) to talk **only** to self-hosted Supabase at `https://supabase.curemedkw.com`. Keep all server-side secrets (service role, JWT secret, API provider keys, SMTP) **out** of the frontend repo.

## Verification (already done)

- `/config.js` is loaded before `/src/main.tsx` in `index.html` ✓
- No app file still imports the old `src/integrations/supabase/client.ts` ✓
- No hardcoded `functions/v1` URLs anywhere ✓
- `clientRuntime.ts` reads `window.__APP_CONFIG__` first, falls back to `VITE_SUPABASE_*` ✓
- **One stale URL found**: `src/lib/db.ts:1097` hardcodes the Lovable Cloud storage URL as the default loader video. Will be fixed in this change.

## Frontend secrets — only 2 public values

```
VITE_SUPABASE_URL=https://supabase.curemedkw.com
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted anon JWT>
```

That's it. The anon key is a public JWT; safety depends entirely on RLS, which is already in place.

**Nothing else** belongs in this repo. The following stay on the self-hosted Supabase stack only (per `SELF_HOSTED.md` § C, H):
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PICSART_API_KEY`, `OPENROUTER_API_KEY`, `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY`, `GOOGLE_CLIENT_SECRET`, all `SMTP_*`.

## Approach: env-driven runtime config (no committed credentials)

Per your preference, do **not** hardcode the URL/key into `public/config.js`. Instead, generate it from env vars at runtime/build:

### 1. `public/config.js` — placeholder template (committed)

```js
// Replaced at runtime by docker/start-nginx.sh, or at dev/build time by Vite env vars.
// Empty values cause clientRuntime.ts to fall back to VITE_SUPABASE_*.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};
```

(Same as today — no change.)

### 2. Dokploy `web` container — already correct

`docker/start-nginx.sh` already rewrites `/usr/share/nginx/html/config.js` from `RUNTIME_SUPABASE_URL` / `RUNTIME_SUPABASE_ANON_KEY` on every start. You set those two values in Dokploy → frontend service env. No code change needed.

### 3. Lovable preview + published lovable.app — env vars only

Lovable's preview/build environment can't run a shell script to rewrite `config.js`, so for **those two environments** the fallback path is what runs: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` baked into the bundle at build time.

Lovable currently injects its own values for those two from Lovable Cloud. To override them, set them in **Lovable → Project Settings → Build Secrets** (workspace-level env vars available at build time):

- `VITE_SUPABASE_URL` = `https://supabase.curemedkw.com`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = your self-hosted anon JWT

Once set, Vite picks them up on the next build. The committed code stays clean — switching back to Lovable Cloud is just removing those two build secrets.

> Note: I cannot set Build Secrets for you — that's a workspace-admin action. After you add them, the next preview rebuild will use self-hosted.

### 4. Optional `.env.example` update

Update the example file so future devs know which two vars matter:

```
VITE_SUPABASE_URL=https://supabase.curemedkw.com
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted anon key>
# Optional Dokploy-only runtime overrides:
# RUNTIME_SUPABASE_URL=https://supabase.curemedkw.com
# RUNTIME_SUPABASE_ANON_KEY=<self-hosted anon key>
```

## Code change in this repo

Just one small fix:

**`src/lib/db.ts:1097`** — replace the hardcoded `yjvqzvmyritxegugfhkt.supabase.co` loader-video URL with either an empty string fallback or a relative `/loading.mp4` path, so nothing in the bundle still points at the old project. The active value comes from `site_settings.loader_video_url` anyway.

No other source files need editing. No new files. No type changes.

## Server-side prerequisites (you / ops, not me)

Before flipping the switch, confirm on `https://supabase.curemedkw.com`:

1. **Migrations applied** — `bash scripts/apply-self-hosted-migrations.sh`
2. **Edge functions deployed** with their secrets (`SELF_HOSTED.md` §C, §H)
3. **Storage buckets exist & public**: `hero-media`, `product-images`, `category-images`, `buket-images`, `brands-images`, `favicone`, `avatars`
4. **Kong CORS** allows: `https://curemedkw.com`, `https://curemedkw.lovable.app`, **and** the preview origin `https://id-preview--572b9c01-61fc-4795-bd86-b97ac69f8cac.lovable.app`
5. **Auth → Redirect URLs** include all three origins above
6. **Data copied** from Lovable Cloud (one-time `pg_dump --data-only`, plus the `migrate-storage-copy` loop for files), otherwise the site is empty
7. **Google OAuth client** configured against `https://supabase.curemedkw.com/auth/v1/callback`

If any of these are missing, the switch will surface as: empty pages, CORS errors in the console, or "Invalid login credentials" on sign-in.

## Caveats

- All current sessions become invalid on the switch (different JWT issuer). Everyone signs in again.
- `src/integrations/supabase/types.ts` stays as-is; it's accurate as long as `supabase/migrations/` is the source of truth for both backends.
- Reverting = remove the two Build Secrets in Lovable, and on Dokploy clear the `RUNTIME_*` env vars + restart.

## Implementation steps when you approve

1. Edit `src/lib/db.ts` line 1097 — remove the Lovable Cloud storage URL fallback.
2. Update `.env.example` to document the two required vars.
3. Tell you to set the two Build Secrets in Lovable and the two `RUNTIME_*` vars in Dokploy.

That's the whole change in the codebase.