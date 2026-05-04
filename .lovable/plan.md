## Goal

Replace the bind-mounted `config.js` with a container-startup `printf` that writes `/usr/share/nginx/html/config.js` from Dokploy env vars. Lovable preview unchanged.

## Changes

### 1. `docker-compose.yml` — replace `web` service with the user-supplied version

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
        VITE_SUPABASE_PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID}
    image: curemed-web:latest
    container_name: curemed-web
    restart: unless-stopped
    ports:
      - "3000:80"
    environment:
      RUNTIME_SUPABASE_URL: ${RUNTIME_SUPABASE_URL}
      RUNTIME_SUPABASE_ANON_KEY: ${RUNTIME_SUPABASE_ANON_KEY}
    command: >
      sh -c 'printf "%s\n" \
        "window.__APP_CONFIG__ = {" \
        "  SUPABASE_URL: \"$${RUNTIME_SUPABASE_URL}\"," \
        "  SUPABASE_ANON_KEY: \"$${RUNTIME_SUPABASE_ANON_KEY}\"" \
        "};" \
        > /usr/share/nginx/html/config.js
        nginx -g "daemon off;"'
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

The bind-mount volume is removed entirely. `$${...}` escapes interpolation so the literal `${VAR}` reaches the container shell, which expands it against `RUNTIME_SUPABASE_URL` / `RUNTIME_SUPABASE_ANON_KEY`.

### 2. `.dockerignore` — drop the now-irrelevant `config.js` line and its comment

There is no host-side `config.js` anymore.

### 3. Dokploy → Environment (one-time, no repo change)

```
RUNTIME_SUPABASE_URL=https://supabase.curemedkw.com
RUNTIME_SUPABASE_ANON_KEY=<self-hosted anon key>
```

## Not changed

- `public/config.js` — empty fallback for Lovable preview.
- `index.html` — already loads `/config.js` before the bundle.
- `src/integrations/supabase/clientRuntime.ts` — already prefers `window.__APP_CONFIG__`, falls back to Vite env.
- `src/integrations/supabase/client.ts` — Lovable-managed, untouched.
- `Dockerfile`, `.env` — untouched.

## Verification after deploy

1. `docker exec curemed-web cat /usr/share/nginx/html/config.js` shows the self-hosted URL.
2. `https://curemedkw.com` console: `[supabase] using URL: https://supabase.curemedkw.com`.
3. Network tab: `/auth/v1/*` and `/rest/v1/*` go to `supabase.curemedkw.com`.
4. Lovable preview console still shows `lgcuwsjlxkntwzlgjtzp.supabase.co`.
