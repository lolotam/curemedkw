## Goal

Make the Dokploy/Docker production build read its Supabase URL + anon key from a runtime-mounted `config.js`, while Lovable preview keeps using Lovable Cloud unchanged.

## Current state (already in place from previous step)

- `public/config.js` exists with empty defaults (falls back to Vite env vars).
- `src/integrations/supabase/clientRuntime.ts` reads `window.__APP_CONFIG__` first, then `VITE_SUPABASE_*`.
- All 13 app imports use `clientRuntime`. `src/integrations/supabase/client.ts` is untouched (Lovable-managed).
- `index.html` already loads `/config.js` before `/src/main.tsx`.

So nothing in the app code needs to change. The remaining work is purely on the Docker/Dokploy side.

## Changes

### 1. `docker-compose.yml` — add volume mount on the `web` service

```yaml
services:
  web:
    # ... existing build / image / ports / healthcheck stay as-is ...
    volumes:
      - ./config.js:/usr/share/nginx/html/config.js:ro
```

This overrides the empty `config.js` baked into the image with the host file at container start. Read-only mount so the container can't mutate it.

### 2. Create `config.js` at the Dokploy host repo root (next to `docker-compose.yml`)

This file is NOT committed to the repo (it contains the deployment-specific anon key). It is created once on the Dokploy host:

```js
window.__APP_CONFIG__ = {
  SUPABASE_URL: "https://supabase.curemedkw.com",
  SUPABASE_ANON_KEY: "<self-hosted anon key>"
};
```

I will also add `config.js` to `.dockerignore` and `.gitignore` so it can never accidentally be baked into the image or committed.

### 3. Verify `index.html` loads `/config.js` before the bundle

Already done — confirmed `<script src="/config.js"></script>` sits immediately before `<script type="module" src="/src/main.tsx"></script>`. No change needed.

## Explicitly NOT changed

- `src/integrations/supabase/client.ts` — untouched, Lovable-managed.
- `.env` — untouched. Lovable preview keeps reading `VITE_SUPABASE_URL` = Lovable Cloud project.
- `Dockerfile` — no change. Build args still pass Lovable Cloud values as a safe fallback if the volume isn't mounted.
- No app code changes.

## How the two environments resolve at runtime

```text
Lovable preview (id-preview--*.lovable.app)
  /config.js  -> repo's public/config.js  (empty SUPABASE_URL)
  fallback    -> VITE_SUPABASE_URL = Lovable Cloud
  result      -> Lovable Cloud  ✓

Dokploy production (curemedkw.com)
  /config.js  -> host-mounted file (self-hosted URL + anon key)
  result      -> https://supabase.curemedkw.com  ✓
```

## Verification after deploy

1. Open `https://curemedkw.com` → DevTools console must show:
   `[supabase] using URL: https://supabase.curemedkw.com`
2. Network tab: `/auth/v1/*` and `/rest/v1/*` requests go to `supabase.curemedkw.com`.
3. Open Lovable preview → console must still show the Lovable Cloud URL (`lgcuwsjlxkntwzlgjtzp.supabase.co`).

## Dokploy host setup checklist (one-time)

1. On the Dokploy host, in the repo working dir, create `config.js` with the production values shown above.
2. `chmod 644 config.js`.
3. Redeploy the stack — Dokploy will recreate the `web` container with the new mount.
4. If `config.js` is missing on the host the container will fail to start (mount target won't exist) — create it first.
