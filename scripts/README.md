# Self-hosted Supabase migrations

Production runs on a **self-hosted Supabase** stack. Schema changes for
production live in `supabase/migrations/` (the same folder Lovable Cloud uses
during development) and are applied with `apply-self-hosted-migrations.sh`.

This workflow is intentionally **host-side only** — never exposed as a
frontend route, edge function, or browser action.

## After every deploy

Run this on the host where the Supabase docker stack is running, from the
project root:

```bash
bash scripts/apply-self-hosted-migrations.sh
```

To target a different container:

```bash
SUPABASE_DB_CONTAINER=my-other-db bash scripts/apply-self-hosted-migrations.sh
```

Optional overrides: `SUPABASE_DB_USER` (default `postgres`),
`SUPABASE_DB_NAME` (default `postgres`).

## What the script does

- Uses `psql -v ON_ERROR_STOP=1 --single-transaction`, so any error aborts
  the migration cleanly and the script exits non-zero.
- Bootstraps `public.self_hosted_migrations` (a tracking table) on first run.
  The bootstrap SQL is inlined in the script — there is no separate bootstrap
  file in `supabase/migrations/`.
- Applies every `supabase/migrations/*.sql` file in lexicographic order
  (timestamp prefix → chronological).
- Skips files already recorded with a matching SHA-256 checksum.
- **Aborts** if a previously-applied migration's contents have changed.
- Records each successful migration with its filename and checksum.

## First-time setup: baseline existing migrations

Your production database already has all the historical Lovable Cloud
migrations applied. To prevent the script from trying to re-run them on first
execution, **baseline** them by marking them as already-applied. Run this once
on the host:

```bash
docker exec -i cloud-supabase-hns8fw-supabase-db \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.self_hosted_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum   text
);
SQL

# From the project root:
for f in supabase/migrations/*.sql; do
  name="$(basename "$f")"
  sum="$(sha256sum "$f" | awk '{print $1}')"
  docker exec -i cloud-supabase-hns8fw-supabase-db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "INSERT INTO public.self_hosted_migrations (filename, checksum)
     VALUES ('$name', '$sum') ON CONFLICT (filename) DO NOTHING"
done
```

After that, only **new** migration files added in future deploys will be
applied.

## Adding a new migration

1. Create a file in `supabase/migrations/` named:
   ```
   YYYYMMDDHHMMSS_short_description.sql
   ```
   Example: `20260504120000_add_category_image_url.sql`
2. Use UTC timestamps so files sort chronologically.
3. Prefer idempotent SQL (`CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.).
4. Commit and deploy.
5. On the host, run:
   ```bash
   bash scripts/apply-self-hosted-migrations.sh
   ```

## Rules

- **Never edit a migration after it has been applied.** Create a new one.
- **Never run migrations from the browser** or from an edge function.
- The default container name `cloud-supabase-hns8fw-supabase-db` matches the
  current Dokploy deployment. Override with `SUPABASE_DB_CONTAINER` if it
  changes.
