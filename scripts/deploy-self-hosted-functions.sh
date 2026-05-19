#!/usr/bin/env bash
#
# deploy-self-hosted-functions.sh
#
# Deploy edge functions in supabase/functions/* to the self-hosted Supabase
# stack at https://supabase.curemedkw.com.
#
# Production functions deployed by this script:
#   - scrape-product       (Firecrawl scrape, admin-only, used by AI import)
#   - extract-product      (LLM field extraction, dispatches per provider)
#   - translate-product    (Arabic translation, used by AdminProductEditor)
#   - openrouter-models    (lists OpenRouter models for admin UI)
#   - openai-models        (lists OpenAI models for admin UI)
#   - google-models        (lists Google Gemini models for admin UI)
#   - upscale-image        (Picsart AI upscale, admin-only, used by product editor)
#   - upscale-image-ai     (OpenAI/Gemini AI upscale, admin-only, used by product editor)
#   - migrate-storage-copy (one-shot ops helper, not invoked by the app)
#
# All functions deploy with --no-verify-jwt because they perform their own
# in-code auth (Authorization header + has_role checks where relevant).
#
# Prereqs (one time, on the host you run this from):
#   1. supabase CLI installed: https://supabase.com/docs/guides/cli
#   2. Export env vars before invoking — NEVER commit values to the repo:
#        export SUPABASE_URL="https://supabase.curemedkw.com"
#        export SUPABASE_AUTH_TOKEN="<self-hosted Studio PAT>"
#        export SUPABASE_DB_URL="postgres://postgres:<POSTGRES_PASSWORD>@supabase.curemedkw.com:5432/postgres"
#   3. Function secrets already set on the self-hosted stack:
#        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
#        LOVABLE_API_KEY, FIRECRAWL_API_KEY, OPENROUTER_API_KEY, PICSART_API_KEY,
#        OPENAI_API_KEY, GOOGLE_API_KEY
#
# Usage from the Dokploy server (typical):
#   cd /etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code
#   bash scripts/deploy-self-hosted-functions.sh
#
# Or deploy a subset:
#   bash scripts/deploy-self-hosted-functions.sh scrape-product translate-product

set -euo pipefail

# --- preflight ---------------------------------------------------------------

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: supabase CLI not found on PATH." >&2
  exit 1
fi

missing=()
for v in SUPABASE_URL SUPABASE_AUTH_TOKEN SUPABASE_DB_URL; do
  if [ -z "${!v:-}" ]; then
    missing+=("$v")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "WARNING: the following env vars are unset: ${missing[*]}" >&2
  echo "         supabase CLI may fall back to interactive prompts or fail." >&2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTIONS_DIR="$PROJECT_ROOT/supabase/functions"

# --- resolve function list ---------------------------------------------------

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

# --- deploy ------------------------------------------------------------------

failed=()
for fn in "${fns[@]}"; do
  echo ">>> deploying $fn"
  if ! ( cd "$PROJECT_ROOT" && supabase functions deploy "$fn" --no-verify-jwt ); then
    echo "!!! deploy failed: $fn" >&2
    failed+=("$fn")
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "Done with errors. Failed: ${failed[*]}" >&2
  exit 1
fi

echo "Done. All functions deployed."
