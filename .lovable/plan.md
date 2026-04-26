## Goal
Populate `/admin/tags` with every tag actually in use by products (currently ~150+ unique tags live on `products.tags[]` but the `tags` master table is empty), and keep it in sync going forward. The admin UI already supports add / rename / delete and shows a "Used in N products" count — those will start working as soon as the table is backfilled.

## 1. One-time backfill (SQL migration)

New migration that scans `products.tags[]`, collects every distinct value (trimmed, non-empty), and inserts into `public.tags` with a slug. Uses `ON CONFLICT (slug) DO NOTHING` so it's idempotent and safe to re-run.

```sql
INSERT INTO public.tags (name, slug)
SELECT DISTINCT
  trim(t)                                           AS name,
  regexp_replace(lower(trim(t)), '[^a-z0-9]+', '-', 'g') AS slug
FROM public.products, unnest(products.tags) AS t
WHERE trim(t) <> ''
ON CONFLICT (slug) DO NOTHING;
```

This will create rows for every tag — e.g. `moisturizer` (used by 34 products), `tea tree` (28), `hydration` (18), `antibacterial` (10), `dry skin` (10) … down to single-use tags like `aloe vera`, `castor oil`, etc.

## 2. Auto-sync `tags` whenever products change (`src/lib/db.ts`)

Add a small helper `syncProductTags(tags: string[])` that upserts each tag into the `tags` table (uses the existing `slug` unique constraint). Call it inside:

- `useCreateProduct` — after the product insert, before returning.
- `useUpdateProduct` — when the patch contains `tags`, after the update.

Any tag the AI extractor or a manual edit produces is automatically registered in the master tag list, so `/admin/tags` always reflects reality. The mutations also invalidate `qk.tags` so the Tags admin refreshes immediately.

## 3. Add "Sync from products" button on `/admin/tags` (`src/pages/admin/AdminTags.tsx`)

A small secondary button next to the "Add" input that runs the same scan/upsert on demand from the client (using `useProducts()` + `useUpsertTag` in a loop). Useful if anyone ever bulk-imports tags directly into a product without going through the editor.

The existing add / rename / delete flows and the "Used in N products" count column already work correctly — they just had nothing to display because the table was empty.

## Files to edit / create
- `supabase/migrations/<new>.sql` — backfill `tags` from `products.tags[]`
- `src/lib/db.ts` — add `syncProductTags`, call from `useCreateProduct` and `useUpdateProduct`
- `src/pages/admin/AdminTags.tsx` — add "Sync from products" button

## Out of scope (already in place)
- Tags table, RLS policies, slug uniqueness — already exist.
- Add / rename / delete tag mutations — already implemented.
- "Used in" count column with link to filtered products list — already implemented.