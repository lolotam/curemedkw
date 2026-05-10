#!/usr/bin/env bash
#
# deploy-self-hosted-functions.sh
#
# Deploy every supabase/functions/* to the self-hosted Supabase stack
# using the Supabase CLI. Run from the project root, on a host that can
# reach the self-hosted API (e.g. the Dokploy server, or your laptop with
# DNS pointing at supabase.curemedkw.com).
#
# Prereqs:
#   1. supabase CLI installed (https://supabase.com/docs/guides/cli)
#   2. Env vars set:
#        export SUPABASE_URL="https://supabase.curemedkw.com"
#        export SUPABASE_AUTH_TOKEN="<dashboard PAT, or skip if using --no-verify-jwt only flow>"
#        export SUPABASE_DB_URL="postgres://postgres:<POSTGRES_PASSWORD>@supabase.curemedkw.com:5432/postgres"
#   3. Function secrets already set on the self-hosted stack:
#        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#        LOVABLE_API_KEY, FIRECRAWL_API_KEY, OPENROUTER_API_KEY
#
# Usage:
#   bash scripts/deploy-self-hosted-functions.sh
#   bash scripts/deploy-self-hosted-functions.sh scrape-product translate-product

set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: supabase CLI not found on PATH." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTIONS_DIR="$PROJECT_ROOT/supabase/functions"

if [ "$#" -gt 0 ]; then
  fns=("$@")
else
  fns=()
  for d in "$FUNCTIONS_DIR"/*/; do
    [ -d "$d" ] || continue
    fns+=("$(basename "$d")")
  done
fi

echo "Deploying ${#fns[@]} function(s) to ${SUPABASE_URL:-<unset SUPABASE_URL>}"

for fn in "${fns[@]}"; do
  echo ">>> deploying $fn"
  ( cd "$PROJECT_ROOT" && supabase functions deploy "$fn" --no-verify-jwt )
done

echo "Done."
