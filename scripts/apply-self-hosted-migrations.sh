#!/usr/bin/env bash
#
# apply-self-hosted-migrations.sh
#
# Apply SQL migrations from supabase/migrations/ to the self-hosted
# Supabase Postgres container. Idempotent and safe to re-run.
#
# Usage (from project root):
#   bash scripts/apply-self-hosted-migrations.sh
#
# Override the target container if needed:
#   SUPABASE_DB_CONTAINER=my-other-db bash scripts/apply-self-hosted-migrations.sh
#
# Requires:
#   - docker on PATH
#   - the Supabase DB container running on this host
#

set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-cloud-supabase-hns8fw-supabase-db}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"
BOOTSTRAP_FILE="00000000000000_init_migration_tracker.sql"

PSQL_BASE=(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME")

log() { printf '%s\n' "$*" >&2; }

# --- preflight ----------------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker is not installed or not on PATH."
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  log "ERROR: container '$CONTAINER' not found. Set SUPABASE_DB_CONTAINER if needed."
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  log "ERROR: migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

# --- step A: bootstrap tracker table -----------------------------------------

if [ ! -f "$MIGRATIONS_DIR/$BOOTSTRAP_FILE" ]; then
  log "ERROR: missing bootstrap file: $MIGRATIONS_DIR/$BOOTSTRAP_FILE"
  exit 1
fi

log "[bootstrap] applying $BOOTSTRAP_FILE (CREATE TABLE IF NOT EXISTS)"
"${PSQL_BASE[@]}" --single-transaction < "$MIGRATIONS_DIR/$BOOTSTRAP_FILE"

# --- step B: apply remaining migrations in order ------------------------------

applied=0
skipped=0

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

# sort lexicographically (timestamp prefix => chronological)
IFS=$'\n' files=($(printf '%s\n' "${files[@]}" | sort))
unset IFS

for path in "${files[@]}"; do
  filename="$(basename "$path")"

  # bootstrap is applied unconditionally above; never track it
  if [ "$filename" = "$BOOTSTRAP_FILE" ]; then
    continue
  fi

  checksum="$(sha256sum "$path" | awk '{print $1}')"

  existing="$("${PSQL_BASE[@]}" -At -c \
    "SELECT checksum FROM public.self_hosted_migrations WHERE filename = '$(printf %s "$filename" | sed "s/'/''/g")'")"

  if [ -n "$existing" ]; then
    if [ "$existing" = "$checksum" ]; then
      log "[skip] $filename (already applied)"
      skipped=$((skipped + 1))
      continue
    else
      log "ERROR: checksum mismatch for $filename."
      log "       Stored:   $existing"
      log "       Current:  $checksum"
      log "       Migrations must be immutable. Create a new migration file instead of editing this one."
      exit 1
    fi
  fi

  log "[apply] $filename"
  "${PSQL_BASE[@]}" --single-transaction < "$path"

  "${PSQL_BASE[@]}" -c \
    "INSERT INTO public.self_hosted_migrations (filename, checksum) VALUES ('$(printf %s "$filename" | sed "s/'/''/g")', '$checksum')"

  applied=$((applied + 1))
done

log ""
log "Done. Applied $applied, skipped $skipped."
