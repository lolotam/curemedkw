#!/usr/bin/env bash
#
# apply-self-hosted-migrations.sh
#
# Apply SQL migrations from supabase/migrations/ to the self-hosted
# Supabase Postgres container. Idempotent and safe to re-run.
#
# Usage (from project root, on the host running the Supabase docker stack):
#   bash scripts/apply-self-hosted-migrations.sh
#
# Override the target container if needed:
#   SUPABASE_DB_CONTAINER=my-other-db bash scripts/apply-self-hosted-migrations.sh
#
# Other overrides:
#   SUPABASE_DB_USER (default: postgres)
#   SUPABASE_DB_NAME (default: postgres)
#
# Requires: docker on PATH and the Supabase DB container running.
#

set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-cloud-supabase-hns8fw-supabase-db}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"

PSQL=(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME")

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

# --- step A: bootstrap tracker table (inlined; idempotent) -------------------

log "[bootstrap] ensuring public.self_hosted_migrations exists"
"${PSQL[@]}" --single-transaction <<'SQL'
CREATE TABLE IF NOT EXISTS public.self_hosted_migrations (
  filename     text PRIMARY KEY,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  checksum     text
);
SQL

# --- step B: apply remaining migrations in lexicographic order ---------------

applied=0
skipped=0

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [ "${#files[@]}" -gt 0 ]; then
  IFS=$'\n' files=($(printf '%s\n' "${files[@]}" | sort))
  unset IFS
fi

sql_escape() { printf %s "$1" | sed "s/'/''/g"; }

for path in "${files[@]}"; do
  filename="$(basename "$path")"
  checksum="$(sha256sum "$path" | awk '{print $1}')"
  esc_filename="$(sql_escape "$filename")"

  existing="$("${PSQL[@]}" -At -c \
    "SELECT checksum FROM public.self_hosted_migrations WHERE filename = '$esc_filename'")"

  if [ -n "$existing" ]; then
    if [ "$existing" = "$checksum" ]; then
      log "[skip] $filename (already applied)"
      skipped=$((skipped + 1))
      continue
    else
      log "ERROR: checksum mismatch for $filename."
      log "       Stored:   $existing"
      log "       Current:  $checksum"
      log "       Migrations are immutable — create a new migration file instead of editing this one."
      exit 1
    fi
  fi

  log "[apply] $filename"
  "${PSQL[@]}" --single-transaction < "$path"

  "${PSQL[@]}" -c \
    "INSERT INTO public.self_hosted_migrations (filename, checksum) VALUES ('$esc_filename', '$(sql_escape "$checksum")')"

  applied=$((applied + 1))
done

log ""
log "Done. Applied $applied, skipped $skipped."
