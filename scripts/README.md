# Self-hosted Supabase migrations

This project uses **Lovable Cloud** during development, but production runs on a
**self-hosted Supabase** stack. Schema changes for production live in
`supabase/migrations/` and are applied with `apply-self-hosted-migrations.sh`.

This workflow is intentionally **host-side only** — it is never exposed as a
frontend route, edge function, or browser action.

## After every deploy

Run this on the host where the Supabase docker stack is running:

```bash
bash scripts/apply-self-hosted-migrations.sh
```

To target a different container:

```bash
SUPABASE_DB_CONTAINER=my-other-db bash scripts/apply-self-hosted-migrations.sh
```

Optional overrides: `SUPABASE_DB_USER` (default `postgres`), `SUPABASE_DB_NAME`
(default `postgres`).

The script:

- Uses `psql -v ON_ERROR_STOP=1 --single-transaction` so any error aborts that
  migration cleanly.
- Bootstraps `public.self_hosted_migrations` (a tracking table) on first run.
- Applies every `supabase/migrations/*.sql` file in lexicographic order.
- Skips files already recorded with a matching SHA-256 checksum.
- **Aborts** if a previously-applied migration's contents have changed.
- Records each successful migration with its filename and checksum.
- Exits non-zero on any failure (safe for CI / deploy pipelines).

## Adding a new migration

1. Create a new file in `supabase/migrations/` named:
   ```
   YYYYMMDDHHMMSS_short_description.sql
   ```
   Example: `20260504120000_add_category_image_url.sql`
2. Use UTC timestamps so files sort chronologically.
3. Write idempotent SQL where possible (`CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.).
4. Commit and deploy.
5. On the host, run the command above.

## Rules

- **Never edit a migration after it has been applied.** Create a new one.
- **Never run migrations from the browser** or from an edge function.
- The bootstrap file `00000000000000_init_migration_tracker.sql` is special:
  it's applied unconditionally on every run and is **not** recorded in the
  tracking table.
- The default container name `cloud-supabase-hns8fw-supabase-db` matches the
  current Dokploy deployment. Change via `SUPABASE_DB_CONTAINER` if it moves.
