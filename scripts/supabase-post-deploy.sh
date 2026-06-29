#!/usr/bin/env bash
#
# supabase-post-deploy.sh
#
# Idempotent post-deployment manifest for the self-hosted Supabase stack.
# Run this AFTER every Dokploy redeployment of the Supabase service to
# re-inject MyFatoorah payment config, deploy edge functions, and apply
# database migrations.
#
# What it does (all steps are safe to re-run):
#   1. Ensures MYFATOORAH_* + APP_PUBLIC_URL are in .env
#   2. Ensures docker-compose.yml passes them to the edge-functions container
#   3. Deploys all edge functions (including _shared/) to the functions volume
#   4. Applies pending SQL migrations via the existing migration tracker
#   5. Restarts the edge-functions container if env or function files changed
#
# Usage:
#   bash /etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code/scripts/supabase-post-deploy.sh
#
# Or from the repo root:
#   bash scripts/supabase-post-deploy.sh
#
# To automate after every Dokploy deployment, add to crontab:
#   */5 * * * * bash /etc/dokploy/.../scripts/supabase-post-deploy.sh --quiet
# (The script detects drift and only restarts when something changed.)

set -euo pipefail

QUIET="${1:-}"
[ "$QUIET" = "--quiet" ] && exec 1>/dev/null 2>&1

# ── Paths ────────────────────────────────────────────────────────────────────

COMPOSE_DIR="/etc/dokploy/compose/cloud-supabase-hns8fw/code"
ENV_FILE="$COMPOSE_DIR/.env"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
FUNC_VOL="/etc/dokploy/compose/cloud-supabase-hns8fw/files/volumes/functions"
REPO_DIR="/etc/dokploy/applications/curemedkw-curemedkw-fnsxxa/code"

NEEDS_RESTART=0

log() { printf '[post-deploy] %s\n' "$*" >&2; }

# ── Detect container names ───────────────────────────────────────────────────

EDGE_CTR="$(docker ps --format '{{.Names}}' | grep 'edge-functions' | head -1 || true)"
DB_CTR="$(docker ps --format '{{.Names}}' | grep -E 'supabase-db$' | head -1 || true)"

if [ -z "$EDGE_CTR" ]; then
  log "ERROR: edge-functions container not found. Is the Supabase stack running?"
  exit 1
fi

# ── Step 1: Ensure env vars in .env ──────────────────────────────────────────

ensure_env_var() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  log "adding $key to .env"
  echo "${key}=${val}" >> "$ENV_FILE"
  NEEDS_RESTART=1
}

ensure_env_var "MYFATOORAH_TOKEN"          "SK_KWT_vVZlnnAqu8jRByOWaRPNId4ShzEDNt256dvnjebuyzo52dXjAfRx2ixW5umjWSUx"
ensure_env_var "MYFATOORAH_BASE_URL"       "https://apitest.myfatoorah.com"
ensure_env_var "MYFATOORAH_CURRENCY"       "KWD"
ensure_env_var "MYFATOORAH_COUNTRY_ISO"    "KWT"
ensure_env_var "MYFATOORAH_MODE"           "test"
ensure_env_var "MYFATOORAH_WEBHOOK_SECRET" "YOUR_TEST_WEBHOOK_SECRET"
ensure_env_var "APP_PUBLIC_URL"            "https://curemedkw.com"

# ── Step 2: Ensure docker-compose.yml references them ────────────────────────

# Dokploy regenerates docker-compose.yml on redeploy, so we re-inject the
# environment references if they're missing from the functions service.
MF_VARS=(
  "MYFATOORAH_TOKEN: \${MYFATOORAH_TOKEN:-}"
  "MYFATOORAH_BASE_URL: \${MYFATOORAH_BASE_URL:-https://apitest.myfatoorah.com}"
  "MYFATOORAH_CURRENCY: \${MYFATOORAH_CURRENCY:-KWD}"
  "MYFATOORAH_COUNTRY_ISO: \${MYFATOORAH_COUNTRY_ISO:-KWT}"
  "MYFATOORAH_MODE: \${MYFATOORAH_MODE:-test}"
  "MYFATOORAH_WEBHOOK_SECRET: \${MYFATOORAH_WEBHOOK_SECRET:-}"
  "APP_PUBLIC_URL: \${APP_PUBLIC_URL:-}"
)

# Find the functions service environment block and check if MYFATOORAH_TOKEN is there.
# We insert after the SUPABASE_PUBLIC_URL line inside the functions environment.
if ! grep -q "MYFATOORAH_TOKEN" "$COMPOSE_FILE" 2>/dev/null; then
  log "injecting MYFATOORAH env refs into docker-compose.yml functions service"
  INSERT_LINES=""
  for var in "${MF_VARS[@]}"; do
    INSERT_LINES="${INSERT_LINES}      ${var}\n"
  done
  # Insert after the last SUPABASE_PUBLIC_URL line (which is in the functions env block)
  sed -i "/SUPABASE_PUBLIC_URL:/a\\${INSERT_LINES}" "$COMPOSE_FILE"
  NEEDS_RESTART=1
fi

# Validate compose syntax after edits
if ! docker compose -f "$COMPOSE_FILE" config --quiet 2>/dev/null; then
  log "WARNING: compose syntax check failed — check $COMPOSE_FILE manually"
fi

# ── Step 3: Deploy edge functions ────────────────────────────────────────────

# Copy _shared/ and all function directories from the repo to the volume.
# Only restart if files actually changed (rsync-like check via checksum).
DEPLOY_DIRS=("_shared" "create-myfatoorah-payment" "verify-myfatoorah-payment"
  "myfatoorah-webhook" "send-whatsapp" "extract-product" "translate-product"
  "rewrite-long-description" "upscale-image" "upscale-image-ai" "scrape-product"
  "openrouter-models" "openai-models" "google-models" "anthropic-models"
  "ai-test-connection" "migrate-storage-copy" "main")

for dir in "${DEPLOY_DIRS[@]}"; do
  SRC="$REPO_DIR/supabase/functions/$dir"
  DST="$FUNC_VOL/$dir"
  [ -d "$SRC" ] || continue

  # Check if content differs (compare checksums of all .ts files)
  SRC_CKSUM="$(find "$SRC" -name '*.ts' -exec sha256sum {} \; 2>/dev/null | sha256sum | cut -d' ' -f1)"
  DST_CKSUM="$(find "$DST" -name '*.ts' -exec sha256sum {} \; 2>/dev/null | sha256sum | cut -d' ' -f1)"

  if [ "$SRC_CKSUM" != "$DST_CKSUM" ]; then
    log "deploying function: $dir"
    mkdir -p "$DST"
    cp -r "$SRC"/* "$DST"/ 2>/dev/null || true
    NEEDS_RESTART=1
  fi
done

# ── Step 4: Apply database migrations ────────────────────────────────────────

if [ -n "$DB_CTR" ] && [ -f "$REPO_DIR/scripts/apply-self-hosted-migrations.sh" ]; then
  log "applying pending migrations"
  bash "$REPO_DIR/scripts/apply-self-hosted-migrations.sh" 2>&1 | grep -E '^\[|ERROR|already' || true
fi

# ── Step 5: Restart if needed ────────────────────────────────────────────────

if [ "$NEEDS_RESTART" -eq 1 ]; then
  log "restarting edge-functions container ($EDGE_CTR)"
  cd "$COMPOSE_DIR"
  docker compose up -d functions 2>&1 | tail -3
  log "done — edge functions redeployed"
else
  log "all up to date — no changes needed"
fi
