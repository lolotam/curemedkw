#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/var/log/curemed"
LOG_FILE="$LOG_DIR/supabase-post-deploy.log"
CRON_LOG_FILE="$LOG_DIR/supabase-post-deploy.cron.log"
mkdir -p "$LOG_DIR"
[ "${1:-}" = "--quiet" ] && exec 1>>"$CRON_LOG_FILE" 2>&1

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
MANIFEST="${MANIFEST:-ops/edge-env.manifest.example.json}"
SECRETS_JSON="${SECRETS_JSON:-/etc/curemed/edge-secrets.production.json}"
COMPOSE_DIR="${COMPOSE_DIR:-/etc/dokploy/compose/cloud-supabase-hns8fw/code}"
FUNC_VOL="${FUNC_VOL:-/etc/dokploy/compose/cloud-supabase-hns8fw/files/volumes/functions}"

[[ "$MANIFEST" = /* ]] || MANIFEST="$REPO_DIR/$MANIFEST"
FUNC_VOL="${FUNC_VOL%/}"
ENV_FILE="$COMPOSE_DIR/.env"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
KONG_FILE="$COMPOSE_DIR/../files/volumes/api/kong.yml"
RUNTIME_ENV="/etc/curemed/edge-runtime.env"

NEEDS_RESTART=0
KONG_RELOAD=0
EDGE_RESTARTED="no"
KONG_STATUS="skipped"
MIGRATIONS_STATUS="skipped"
RUN_STATUS="failed"
REPORT_WRITTEN=0
declare -a REQUIRED_KEYS=()
declare -a DEPLOYED_FUNCTIONS=()
declare -a SMOKE_RESULTS=()
declare -A SECRET_PRESENCE=()

log() {
  printf '[post-deploy] %s\n' "$*" >&2
}

write_report() {
  [ "$REPORT_WRITTEN" -eq 0 ] || return 0
  REPORT_WRITTEN=1

  local commit="unknown"
  local deployed="none"
  if command -v git >/dev/null 2>&1; then
    commit="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  fi
  if [ "${#DEPLOYED_FUNCTIONS[@]}" -gt 0 ]; then
    deployed="$(IFS=,; printf '%s' "${DEPLOYED_FUNCTIONS[*]}")"
  fi

  {
    printf 'timestamp=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    printf 'status=%s\n' "$RUN_STATUS"
    printf 'git_commit=%s\n' "$commit"
    printf 'functions_deployed=%s\n' "$deployed"
    printf 'required_secrets:\n'
    local key
    for key in "${REQUIRED_KEYS[@]}"; do
      printf '  %s=%s\n' "$key" "${SECRET_PRESENCE[$key]:-<unknown>}"
    done
    printf 'migrations=%s\n' "$MIGRATIONS_STATUS"
    printf 'kong_cors=%s\n' "$KONG_STATUS"
    printf 'edge_restart=%s\n' "$EDGE_RESTARTED"
    printf 'smoke_tests:\n'
    local smoke_result
    for smoke_result in "${SMOKE_RESULTS[@]}"; do
      printf '  %s\n' "$smoke_result"
    done
    printf '%s\n' '---'
  } >>"$LOG_FILE"
}

on_exit() {
  local exit_code=$?
  trap - EXIT
  set +e
  [ "$exit_code" -eq 0 ] && RUN_STATUS="success"
  write_report
  exit "$exit_code"
}
trap on_exit EXIT

die() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

validate_inputs() {
  local command_name
  for command_name in jq docker curl python3 grep sha256sum; do
    require_command "$command_name"
  done

  [ -f "$MANIFEST" ] || die "manifest not found: $MANIFEST"
  [ -r "$MANIFEST" ] || die "manifest is not readable: $MANIFEST"
  [ -f "$SECRETS_JSON" ] || die "secrets file not found: $SECRETS_JSON"
  [ -r "$SECRETS_JSON" ] || die "secrets file is not readable: $SECRETS_JSON"
  [ -d "$COMPOSE_DIR" ] || die "compose directory not found: $COMPOSE_DIR"
  [ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"
  [ -f "$KONG_FILE" ] || die "Kong config not found: $KONG_FILE"

  jq -e 'type == "object" and (.requiredSecrets | type == "array") and (.smokeTests | type == "array")' \
    "$MANIFEST" >/dev/null || die "manifest JSON is invalid or incomplete: $MANIFEST"
  jq -e 'type == "object"' "$SECRETS_JSON" >/dev/null || \
    die "secrets JSON must be a JSON object: $SECRETS_JSON"
}

is_placeholder() {
  local normalized="${1,,}"
  local marker
  local -a markers=("PASTE""_" "YOUR""_" "CHANGE""_ME" "placeholder" "PASTE""_REAL" "example")
  for marker in "${markers[@]}"; do
    [[ "$normalized" == *"${marker,,}"* ]] && return 0
  done
  return 1
}

validate_required_secrets() {
  mapfile -t REQUIRED_KEYS < <(jq -r '.requiredSecrets[]' "$MANIFEST")
  [ "${#REQUIRED_KEYS[@]}" -gt 0 ] || die "manifest.requiredSecrets is empty"

  local -a invalid_keys=()
  local key secret_text
  for key in "${REQUIRED_KEYS[@]}"; do
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "invalid required secret key: $key"
    if ! jq -e --arg key "$key" \
      'has($key) and (.[$key] | type == "string" and test("[^[:space:]]"))' \
      "$SECRETS_JSON" >/dev/null; then
      SECRET_PRESENCE[$key]="<missing>"
      invalid_keys+=("$key")
      continue
    fi

    secret_text="$(jq -r --arg key "$key" '.[$key]' "$SECRETS_JSON")"
    if [[ "$secret_text" == *$'\n'* || "$secret_text" == *$'\r'* ]] || is_placeholder "$secret_text"; then
      SECRET_PRESENCE[$key]="<placeholder>"
      invalid_keys+=("$key")
      continue
    fi
    SECRET_PRESENCE[$key]="<set>"
  done

  if [ "${#invalid_keys[@]}" -gt 0 ]; then
    log "missing or placeholder required secrets: ${invalid_keys[*]}"
    exit 1
  fi
}

validate_runtime_entries() {
  jq -e 'all(keys[]; test("^[A-Za-z_][A-Za-z0-9_]*$"))' "$SECRETS_JSON" >/dev/null || \
    die "secrets JSON contains an invalid environment key"
  jq -e 'all(.[]; type == "string" and ((contains("\n") or contains("\r")) | not))' \
    "$SECRETS_JSON" >/dev/null || die "secrets JSON values must be single-line strings"
}

generate_runtime_env() {
  local runtime_dir runtime_temp
  runtime_dir="$(dirname -- "$RUNTIME_ENV")"
  mkdir -p "$runtime_dir"
  runtime_temp="$(mktemp "$runtime_dir/.edge-runtime.env.XXXXXX")"

  python3 - "$SECRETS_JSON" "$runtime_temp" <<'PY'
import json
import sys

source_path, output_path = sys.argv[1:]
with open(source_path, encoding="utf-8") as source:
    secrets = json.load(source)

with open(output_path, "w", encoding="utf-8", newline="\n") as output:
    for key in sorted(secrets):
        quoted = "'" + secrets[key].replace("'", "'\"'\"'") + "'"
        output.write(f"{key}={quoted}\n")
PY

  chmod 600 "$runtime_temp"
  if [ -f "$RUNTIME_ENV" ] && cmp -s "$runtime_temp" "$RUNTIME_ENV"; then
    rm -f "$runtime_temp"
  else
    mv -f "$runtime_temp" "$RUNTIME_ENV"
  fi
  chmod 600 "$RUNTIME_ENV"
  log "generated edge-runtime.env"

  local key
  while IFS= read -r key; do
    log "$key=<set>"
  done < <(jq -r 'keys[]' "$SECRETS_JSON")
}

ensure_compose_env_values() {
  touch "$ENV_FILE"
  local key quoted_secret
  for key in "${REQUIRED_KEYS[@]}"; do
    if grep -Eq "^${key}=" "$ENV_FILE"; then
      continue
    fi
    quoted_secret="$(jq -r --arg key "$key" '.[$key] | @sh' "$SECRETS_JSON")"
    printf '%s=%s\n' "$key" "$quoted_secret" >>"$ENV_FILE"
    log "added $key to .env"
    NEEDS_RESTART=1
  done
}

inject_compose_refs() {
  local keys_csv edit_status compose_backup
  keys_csv="$(IFS=,; printf '%s' "${REQUIRED_KEYS[*]}")"
  compose_backup="$(mktemp)"
  cp "$COMPOSE_FILE" "$compose_backup"

  edit_status="$(COMPOSE_KEYS_CSV="$keys_csv" python3 - "$COMPOSE_FILE" <<'PY'
import os
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
keys = [key for key in os.environ["COMPOSE_KEYS_CSV"].split(",") if key]

service_match = next(
    ((index, re.match(r"^(\s*)functions:\s*(?:#.*)?$", line))
     for index, line in enumerate(lines)
     if re.match(r"^(\s*)functions:\s*(?:#.*)?$", line)),
    None,
)
if service_match is None:
    raise SystemExit("functions service not found in docker-compose.yml")

service_start, match = service_match
service_indent = len(match.group(1))
service_end = len(lines)
for index in range(service_start + 1, len(lines)):
    stripped = lines[index].strip()
    indent = len(lines[index]) - len(lines[index].lstrip())
    if stripped and not stripped.startswith("#") and indent <= service_indent:
        service_end = index
        break

environment_start = next(
    (index for index in range(service_start + 1, service_end)
     if re.match(r"^\s*environment:\s*(?:#.*)?$", lines[index])),
    None,
)
if environment_start is None:
    raise SystemExit("functions environment block not found in docker-compose.yml")

environment_indent = len(lines[environment_start]) - len(lines[environment_start].lstrip())
environment_end = service_end
for index in range(environment_start + 1, service_end):
    stripped = lines[index].strip()
    indent = len(lines[index]) - len(lines[index].lstrip())
    if stripped and not stripped.startswith("#") and indent <= environment_indent:
        environment_end = index
        break

children = [line for line in lines[environment_start + 1:environment_end] if line.strip()]
if children and children[0].lstrip().startswith("- "):
    raise SystemExit("list-style functions environment block is not supported")

existing = set()
for line in lines[environment_start + 1:environment_end]:
    key_match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", line)
    if key_match:
        existing.add(key_match.group(1))
missing = [key for key in keys if key not in existing]
if not missing:
    print("unchanged")
    raise SystemExit(0)

child_indent = " " * (environment_indent + 2)
for line in lines[environment_start + 1:environment_end]:
    if line.strip() and not line.lstrip().startswith("#"):
        child_indent = line[:len(line) - len(line.lstrip())]
        break

anchor = environment_start
for index in range(environment_start + 1, environment_end):
    if re.match(r"^\s*SUPABASE_PUBLIC_URL\s*:", lines[index]):
        anchor = index

injected = [f"{child_indent}{key}: ${{{key}:-}}\n" for key in missing]
lines[anchor + 1:anchor + 1] = injected
path.write_text("".join(lines), encoding="utf-8")
print("changed")
PY
)" || {
    rm -f "$compose_backup"
    die "failed to inject functions environment references"
  }

  if ! docker compose -f "$COMPOSE_FILE" config --quiet >/dev/null 2>&1; then
    [ "$edit_status" = "changed" ] && cp "$compose_backup" "$COMPOSE_FILE"
    rm -f "$compose_backup"
    die "docker-compose.yml failed validation after environment injection"
  fi
  rm -f "$compose_backup"

  if [ "$edit_status" = "changed" ]; then
    log "injected edge environment references into functions service"
    NEEDS_RESTART=1
  fi
}

persist_kong_cors() {
  local origins_json edit_status kong_backup
  origins_json="$(jq -c '.app.allowedOrigins' "$MANIFEST")"
  kong_backup="$(mktemp)"
  cp "$KONG_FILE" "$kong_backup"
  KONG_STATUS="failed"

  edit_status="$(ALLOWED_ORIGINS_JSON="$origins_json" python3 - "$KONG_FILE" <<'PY'
import json
import os
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
origins = json.loads(os.environ["ALLOWED_ORIGINS_JSON"])
if not isinstance(origins, list) or not origins or not all(isinstance(origin, str) for origin in origins):
    raise SystemExit("manifest app.allowedOrigins must be a non-empty string array")

service_pattern = re.compile(r"^(\s*)-\s+name:\s*['\"]?functions-v1['\"]?\s*(?:#.*)?$")
service_match = next(
    ((index, service_pattern.match(line)) for index, line in enumerate(lines)
     if service_pattern.match(line)),
    None,
)
if service_match is None:
    raise SystemExit("functions-v1 service not found in kong.yml")

service_start, match = service_match
service_indent = len(match.group(1))
service_end = len(lines)
next_service = re.compile(rf"^\s{{{service_indent}}}-\s+name:")
for index in range(service_start + 1, len(lines)):
    if next_service.match(lines[index]):
        service_end = index
        break

if any("preflight_continue:" in line for line in lines[service_start:service_end]):
    print("unchanged")
    raise SystemExit(0)

cors_pattern = re.compile(r"^(\s*)-\s+name:\s*['\"]?cors['\"]?\s*(?:#.*)?$")
cors_match = next(
    ((index, cors_pattern.match(lines[index])) for index in range(service_start, service_end)
     if cors_pattern.match(lines[index])),
    None,
)
if cors_match is None:
    raise SystemExit("bare cors plugin not found in functions-v1 service")

cors_index, match = cors_match
indent = match.group(1)
config_indent = indent + "  "
field_indent = config_indent + "  "
headers = [
    "Authorization", "apikey", "content-type", "x-client-info",
    "x-supabase-auth", "myfatoorah-signature", "Idempotency-Key", "Accept",
]
replacement = [
    f"{indent}- name: cors\n",
    f"{config_indent}config:\n",
    f"{field_indent}origins: {json.dumps(origins, ensure_ascii=False)}\n",
    f"{field_indent}methods: [GET, POST, OPTIONS]\n",
    f"{field_indent}headers: {json.dumps(headers)}\n",
    f"{field_indent}exposed_headers: [Content-Length]\n",
    f"{field_indent}credentials: false\n",
    f"{field_indent}max_age: 86400\n",
    f"{field_indent}preflight_continue: false\n",
]
lines[cors_index:cors_index + 1] = replacement
path.write_text("".join(lines), encoding="utf-8")
print("changed")
PY
)" || {
    rm -f "$kong_backup"
    die "failed to persist functions-v1 Kong CORS config"
  }

  if [ "$edit_status" = "changed" ]; then
    if python3 -c "import yaml" >/dev/null 2>&1; then
      if ! python3 -c "import sys,yaml; yaml.safe_load(open(sys.argv[1], encoding='utf-8'))" \
        "$KONG_FILE" >/dev/null; then
        cp "$kong_backup" "$KONG_FILE"
        rm -f "$kong_backup"
        die "kong.yml failed YAML validation; original restored"
      fi
    else
      log "WARNING: PyYAML unavailable; skipped kong.yml parser validation"
    fi
    KONG_RELOAD=1
    KONG_STATUS="applied"
    log "persisted functions-v1 Kong CORS config"
  else
    KONG_STATUS="skipped"
  fi
  rm -f "$kong_backup"
}

directory_checksum() {
  local directory="$1"
  [ -d "$directory" ] || {
    printf '%s\n' "missing"
    return 0
  }

  (
    cd "$directory"
    local -a files=()
    mapfile -d '' -t files < <(find . -type f -print0 | sort -z)
    local file
    for file in "${files[@]}"; do
      printf '%s\0' "$file"
      sha256sum "$file"
    done
  ) | sha256sum | awk '{print $1}'
}

validate_schema_prerequisites() {
  # This is read-only and MUST precede env/Kong/function changes. In this release,
  # missing schema is not repaired by deploying code and then applying SQL.
  local database_container="${SUPABASE_DB_CONTAINER:-cloud-supabase-hns8fw-supabase-db}"
  local schema_check="$REPO_DIR/scripts/check-curemed-schema-prerequisites.py"
  [ -f "$schema_check" ] || die "schema prerequisite checker is missing"
  python3 "$schema_check" --repo "$REPO_DIR" --manifest "$MANIFEST" \
    --container "$database_container" >/dev/null || die "schema prerequisites failed; application publication refused"
  if jq -e '.schemaPrerequisites != null' "$MANIFEST" >/dev/null; then
    # The subsequent migration runner must target the same DB, never an unrelated
    # container selected by a broad name match.
    DB_CTR="$database_container"
  fi
}

deploy_functions() {
  # Read the deploy list from the manifest, falling back to the historical
  # hardcoded set so an older manifest still deploys the payment stack.
  #
  # NEVER add "main" here. The server's main/index.ts is hand-patched and has
  # diverged from the repo copy; it is the router for EVERY edge function, so
  # overwriting it takes down payments, upscale and notifications at once.
  local -a function_dirs=()
  mapfile -t function_dirs < <(jq -r '.deployFunctions[]? // empty' "$MANIFEST")
  if [ "${#function_dirs[@]}" -eq 0 ]; then
    function_dirs=(
      "_shared"
      "create-myfatoorah-payment"
      "verify-myfatoorah-payment"
      "myfatoorah-webhook"
      "payment-health"
    )
  fi
  case " ${function_dirs[*]} " in
    *" main "*) die "refusing to deploy 'main': the server router is hand-patched" ;;
  esac

  mkdir -p "$FUNC_VOL"
  [ "$FUNC_VOL" != "/" ] || die "refusing to use root as functions volume"

  local function_dir source destination
  for function_dir in "${function_dirs[@]}"; do
    source="$REPO_DIR/supabase/functions/$function_dir"
    destination="$FUNC_VOL/$function_dir"
    [ -d "$source" ] || die "edge function source missing: $source"
    if [ "$(directory_checksum "$source")" = "$(directory_checksum "$destination")" ]; then
      continue
    fi

    case "$destination" in
      "$FUNC_VOL"/*) ;;
      *) die "unsafe functions destination: $destination" ;;
    esac
    rm -rf -- "$destination"
    cp -r -- "$source" "$FUNC_VOL/"
    DEPLOYED_FUNCTIONS+=("$function_dir")
    NEEDS_RESTART=1
    log "deployed edge function: $function_dir"
  done
}

apply_migrations() {
  local migration_script="$REPO_DIR/scripts/apply-self-hosted-migrations.sh"
  if [ -z "$DB_CTR" ] || [ ! -f "$migration_script" ]; then
    MIGRATIONS_STATUS="skipped"
    log "migrations skipped: database container or migration script unavailable"
    return 0
  fi

  local migration_output migration_exit
  set +e
  migration_output="$(SUPABASE_DB_CONTAINER="$DB_CTR" bash "$migration_script" 2>&1)"
  migration_exit=$?
  set -e

  if [ "$migration_exit" -ne 0 ]; then
    if grep -Eqi 'already applied|no pending migrations' <<<"$migration_output" && \
      ! grep -Eqi 'error|failed' <<<"$migration_output"; then
      MIGRATIONS_STATUS="skipped (already applied)"
      return 0
    fi
    MIGRATIONS_STATUS="failed"
    die "database migration command failed with exit code $migration_exit"
  fi

  if grep -Eq '^\[apply\]|applied=[1-9][0-9]*' <<<"$migration_output"; then
    MIGRATIONS_STATUS="applied"
  else
    MIGRATIONS_STATUS="skipped (already applied)"
  fi
  log "migrations: $MIGRATIONS_STATUS"
}

restart_kong_if_needed() {
  [ "$KONG_RELOAD" -eq 1 ] || return 0
  [ -n "$KONG_CTR" ] || die "Kong CORS changed but no supabase-kong container is running"
  docker restart "$KONG_CTR" >/dev/null
  log "restarted Kong container: $KONG_CTR"
}

restart_functions_if_needed() {
  [ "$NEEDS_RESTART" -eq 1 ] || {
    log "edge functions are up to date; restart skipped"
    return 0
  }

  if (cd "$COMPOSE_DIR" && docker compose up -d functions >/dev/null 2>&1); then
    EDGE_RESTARTED="yes"
  elif [ -n "$EDGE_CTR" ] && docker restart "$EDGE_CTR" >/dev/null; then
    EDGE_RESTARTED="yes"
  else
    die "failed to restart the edge-functions service"
  fi
  log "restarted edge-functions service"
}

run_preflight_smoke() {
  local smoke_json="$1"
  local name method url origin headers_file body_file curl_exit expected_header status
  name="$(jq -r '.name' <<<"$smoke_json")"
  method="$(jq -r '.method' <<<"$smoke_json")"
  url="$(jq -r '.url' <<<"$smoke_json")"
  origin="$(jq -r '.origin' <<<"$smoke_json")"
  headers_file="$(mktemp)"
  body_file="$(mktemp)"

  curl_exit=0
  curl -sS --connect-timeout 10 --max-time 30 -X "$method" \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,apikey,content-type,x-client-info" \
    -D "$headers_file" -o "$body_file" "$url" || curl_exit=$?

  status="PASS"
  if [ "$curl_exit" -ne 0 ]; then
    status="FAIL"
  else
    while IFS= read -r expected_header; do
      if ! grep -Eqi "^${expected_header}:" "$headers_file"; then
        status="FAIL"
      fi
    done < <(jq -r '.expectHeaders[]' <<<"$smoke_json")
  fi
  rm -f "$headers_file" "$body_file"
  SMOKE_RESULTS+=("$name=$status")
  log "$status: $name"
  [ "$status" = "PASS" ]
}

run_post_smoke() {
  local name="create payment POST"
  local origin anon_key url headers_file body_file curl_exit status
  origin="$(jq -r '.app.publicUrl' "$MANIFEST")"
  url="$(jq -r '.supabase.functionsBaseUrl' "$MANIFEST")/create-myfatoorah-payment"
  anon_key="$(jq -r '.SUPABASE_ANON_KEY' "$SECRETS_JSON")"
  headers_file="$(mktemp)"
  body_file="$(mktemp)"

  curl_exit=0
  curl -sS --connect-timeout 10 --max-time 30 -X POST \
    -H "Origin: $origin" \
    -H "apikey: $anon_key" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --data '{"order_id":"00000000-0000-0000-0000-000000000000","payment_method":"KNET"}' \
    -D "$headers_file" -o "$body_file" "$url" || curl_exit=$?

  status="PASS"
  if [ "$curl_exit" -ne 0 ] || \
    ! grep -Eqi '^access-control-allow-origin:' "$headers_file" || \
    ! jq -e . "$body_file" >/dev/null 2>&1; then
    status="FAIL"
  fi
  rm -f "$headers_file" "$body_file"
  SMOKE_RESULTS+=("$name=$status")
  log "$status: $name"
  [ "$status" = "PASS" ]
}

run_smoke_tests() {
  local failed=0 smoke_json
  while IFS= read -r smoke_json; do
    run_preflight_smoke "$smoke_json" || failed=1
  done < <(jq -c '.smokeTests[]' "$MANIFEST")
  run_post_smoke || failed=1

  if [ "$failed" -ne 0 ]; then
    log "POST-DEPLOY SMOKE TEST FAILED"
    exit 1
  fi
  log "all post-deploy smoke tests passed"
}

validate_inputs
validate_required_secrets
validate_runtime_entries
validate_schema_prerequisites
generate_runtime_env
ensure_compose_env_values
inject_compose_refs

RUNNING_CONTAINERS="$(docker ps --format '{{.Names}}' | grep -E 'edge-functions|supabase-kong|supabase-db' || true)"
EDGE_CTR="$(grep -E 'edge-functions' <<<"$RUNNING_CONTAINERS" | head -1 || true)"
KONG_CTR="$(grep -E 'supabase-kong' <<<"$RUNNING_CONTAINERS" | head -1 || true)"
DB_CTR="${DB_CTR:-$(grep -E 'supabase-db' <<<"$RUNNING_CONTAINERS" | head -1 || true)}"

persist_kong_cors
restart_kong_if_needed
deploy_functions
apply_migrations
restart_functions_if_needed
run_smoke_tests
