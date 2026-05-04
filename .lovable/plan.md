## Goal

Move the runtime config.js generation from `docker-compose command:` (which Dokploy ignores) into the Docker image itself via a startup script + Dockerfile `CMD`.

## Changes

### 1. New file: `docker/start-nginx.sh`

```sh
#!/bin/sh
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  SUPABASE_URL: "${RUNTIME_SUPABASE_URL:-}",
  SUPABASE_ANON_KEY: "${RUNTIME_SUPABASE_ANON_KEY:-}"
};
EOF

exec nginx -g "daemon off;"
```

### 2. `Dockerfile` — runtime stage updates

Add after `COPY --from=builder /app/dist ...`:

```dockerfile
COPY docker/start-nginx.sh /usr/local/bin/start-nginx.sh
RUN chmod +x /usr/local/bin/start-nginx.sh
```

Replace the final line:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

with:

```dockerfile
CMD ["/usr/local/bin/start-nginx.sh"]
```

### 3. `docker-compose.yml` — drop the `command:` override

Final web service:

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
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

## Not changed

- `public/config.js` — empty fallback for Lovable preview.
- `index.html` — already loads `/config.js` first.
- `src/integrations/supabase/clientRuntime.ts` — already prefers `window.__APP_CONFIG__`.
- `src/integrations/supabase/client.ts` — Lovable-managed, untouched.
- `.env`, `.dockerignore`.

## Verification after deploy

1. `docker inspect curemed-web --format '{{json .Config.Cmd}}'` → `["/usr/local/bin/start-nginx.sh"]`
2. `docker exec curemed-web cat /usr/share/nginx/html/config.js` → contains `https://supabase.curemedkw.com`
3. Browser console at `https://curemedkw.com` → `[supabase] using URL: https://supabase.curemedkw.com`
4. Lovable preview console still shows `lgcuwsjlxkntwzlgjtzp.supabase.co`.
