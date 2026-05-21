## Goal
Make the admin product editor URL use the product **slug** instead of the UUID:
`/admin/products/{slug}` (e.g. `/admin/products/hand-balm`) — matching the public product URL style.

## Why no SQL migration is needed
- `products.slug` was added in the previous migration (with backfill + auto-slug trigger).
- `useProduct()` in `src/lib/db.ts` already resolves by slug first and falls back to UUID, so old `/admin/products/{uuid}` bookmarks keep working.
- No schema changes required.

## Frontend changes

### 1. `src/pages/admin/AdminProducts.tsx`
Replace the two links that use `p.id` with `p.slug` (fallback to `p.id` for safety):
- Row title link (around line 295)
- Edit pencil button (around line 331)

### 2. `src/pages/admin/AdminProductEditor.tsx`
After successful create (around line 433):
- `navigate(\`/admin/products/${created.slug ?? created.id}\`)`

After successful update, redirect to the slug URL if the current route param differs from the saved slug (handles slug edits / first-time slug assignment), so the browser URL stays canonical.

### 3. `src/App.tsx`
No route change needed — `/admin/products/:id` already matches any string; the `:id` param is just treated as a slug by `useProduct`.

## Result
- Admin edit URLs become `/admin/products/hand-balm` style.
- Old UUID URLs still resolve (legacy fallback in `useProduct`).
- No SQL to run on self-hosted Supabase.
