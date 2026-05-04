#!/bin/sh
set -eu

# Write runtime config consumed by the SPA (loaded from /config.js in index.html).
# Values come from container env vars set by Dokploy. Empty values fall back to
# the build-time Vite env vars baked into the bundle.
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  SUPABASE_URL: "${RUNTIME_SUPABASE_URL:-}",
  SUPABASE_ANON_KEY: "${RUNTIME_SUPABASE_ANON_KEY:-}"
};
EOF

exec nginx -g "daemon off;"
