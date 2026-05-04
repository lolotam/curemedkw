# Self-hosted Supabase migration workflow

Add a safe, idempotent way to apply SQL migrations to your self-hosted Postgres container `cloud-supabase-hns8fw-supabase-db`. Nothing runs from the browser; nothing is exposed as a frontend route.

## Files to create

### 1. `supabase/migrations/.gitkeep`
Empty file so the folder is tracked in git. All future DB changes go here as timestamped files:
```
supabase/migrations/YYYYMMDDHHMMSS_short_description.sql
```
Example: `20260504120000_add_category_image_url.sql`

Convention going forward: every time I make a schema change for you, I will also drop a matching SQL file into `supabase/migrations/`.

### 2. `supabase/migrations/00000000000000_init_migration_tracker.sql`
Bootstraps the tracking table. Idempotent — safe to run repeatedly.

```sql
CREATE TABLE IF NOT EXISTS public.self_hosted_migrations (
  filename     text PRIMARY KEY,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  checksum     text
);
```

### 3. `scripts/apply-self-hosted-migrations.sh`
Bash script that:

- `set -euo pipefail` and uses `psql -v ON_ERROR_STOP=1 --single-transaction`.
- Targets container `cloud-supabase-hns8fw-supabase-db` (overridable via `SUPABASE_DB_CONTAINER` env var).
- Uses `docker exec -i "$CONTAINER" psql -U postgres -d postgres ...`.
- **Step A — bootstrap:** unconditionally apply `supabase/migrations/00000000000000_init_migration_tracker.sql` (it's `IF NOT EXISTS`).
- **Step B — loop** over `supabase/migrations/*.sql` sorted lexicographically:
  1. **Skip the bootstrap file** explicitly:
     ```bash
     if [ "$filename" = "00000000000000_init_migration_tracker.sql" ]; then
       continue
     fi
     ```
     Reason: it's already applied in Step A and must not be tracked like a normal migration.
  2. Compute `sha256sum` checksum.
  3. Query `SELECT checksum FROM public.self_hosted_migrations WHERE filename = '<file>'`.
  4. If already applied with matching checksum → log `[skip] <file>`.
  5. If applied with different checksum → ABORT with clear error (file edited after being applied).
  6. If not applied → `cat file | docker exec -i ... psql ... -1` (single transaction, `ON_ERROR_STOP=1`). On success, `INSERT INTO public.self_hosted_migrations (filename, checksum) VALUES (...)`.
- Final summary: `Applied N, skipped M.`
- Exits non-zero on any failure so CI/deploy pipelines halt.

### 4. `scripts/README.md`
Short doc with the command to run after every deploy:

```bash
# After each deploy, on the host running the Supabase docker stack:
bash scripts/apply-self-hosted-migrations.sh

# Override container name if needed:
SUPABASE_DB_CONTAINER=my-other-db bash scripts/apply-self-hosted-migrations.sh
```

Notes:
- Run from the project root.
- Requires `docker` access on the host and the Supabase DB container running.
- Migrations applied in filename order — always prefix with a UTC timestamp.
- Never edit a migration after it has been applied; create a new one instead.
- Never run this from the browser or an edge function. Host-side only.

## What is NOT changed

- No frontend routes, no React code, no edge functions.
- No changes to `supabase/config.toml`, `Dockerfile`, `docker-compose.yml`, or nginx.
- Lovable Cloud is not touched — this workflow is exclusively for your self-hosted Postgres.

## After approval

I'll create the four files above exactly as described. No DB changes executed by me — you run the script on your host.
