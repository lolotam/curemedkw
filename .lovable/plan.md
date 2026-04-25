
## Goal
Move the entire site off localStorage onto the Lovable Cloud database that's already connected, plus tidy up the admin sidebar logo and the awkward "🔒 Default password: curemed-admin" hint on the login page.

---

## Step 1 — Database schema (migration)

Create the missing tables in Cloud (the `hero_slides` table already exists from the previous migration).

**Enums**
- `app_role` → `'admin' | 'user'`
- `stock_status` → `'in_stock' | 'low_stock' | 'out_of_stock'`
- `brand_key` → `'flexitol' | 'kapiva' | 'nada' | 'abc'`

**`products`** — id (uuid), brand (brand_key), name, category, price (numeric), short_description, long_description, main_image (text URL), gallery (text[]), ingredients (text[]), benefits (text[]), usage, size, sku (unique), stock_status, featured (bool), tags (text[]), created_at, updated_at + `update_updated_at_column` trigger.

**`messages`** — id, name, email, phone, brand (text), subject, message, read (bool), created_at.

**`subscribers`** — id, email (citext, unique), created_at.

**`user_roles`** — id, user_id (fk auth.users), role (app_role), unique(user_id, role).

**`has_role(uuid, app_role)`** — SECURITY DEFINER function (no recursion risk in RLS).

**RLS policies**
| Table | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| products | public | admin only | admin only |
| messages | admin only | public (contact form) | admin only |
| subscribers | admin only | public (newsletter) | admin only (delete) |
| user_roles | admin only | admin only | admin only |

The existing `hero_slides` policies are currently `public` for all operations — I'll tighten INSERT/UPDATE/DELETE to admin-only as part of this migration so admins are the only ones editing landing pages.

---

## Step 2 — Storage bucket
Create a public `product-images` bucket (read public, write admin-only via RLS on `storage.objects`). Same pattern already used for `hero-media`.

---

## Step 3 — Real admin auth
- Delete the hardcoded password in `src/lib/admin.ts`.
- Rebuild `/admin/login` as a real **email + password** + **Google sign-in** form (uses `supabase.auth.signInWithPassword` and `signInWithOAuth({ provider: 'google' })`). Auto-confirm will stay **off** so emails are verified.
- New `useAdminSession()` hook listens to `onAuthStateChange`, fetches the user's roles via `has_role`, and exposes `{ user, isAdmin, loading }`.
- `AdminLayout` becomes async — shows a spinner while loading, redirects to `/admin/login` if not signed in, and shows a "Not authorized" screen if signed in but not an admin.
- After you sign up the first time, I'll insert a `user_roles` row with `role = 'admin'` for your account so you can access `/admin`.

---

## Step 4 — Rewrite the data layer (`src/lib/db.ts` → Cloud)
Replace the localStorage helpers with thin Supabase wrappers + React Query hooks (TanStack Query is already in the project):

- `useProducts()`, `useProductsByBrand(brand)`, `useFeaturedProducts()`, `useProduct(id)`
- `useCreateProduct()`, `useUpdateProduct()`, `useDeleteProduct()`
- `useMessages()`, `useUnreadCount()`, `useCreateMessage()`, `useMarkMessageRead()`, `useDeleteMessages()`
- `useSubscribers()`, `useSubscribe()`, `useDeleteSubscriber()`

`useDbVersion()` and the `curemed-db-change` event bus go away — React Query handles invalidation.

Pages updated to async hooks (with skeletons + error toasts):
- `CuremedHome`, `BrandPage`, `ProductDetail`, `ContactSection`, `Newsletter`
- `AdminOverview`, `AdminProducts`, `AdminProductEditor`, `AdminMessages`, `AdminSubscribers`

`AdminProductEditor` switches from base64-in-localStorage to real uploads against the `product-images` bucket (returns public URL → saved into `products.main_image` / `products.gallery`).

---

## Step 5 — Seed the 20 sample products
Port `src/lib/seed.ts` into a one-time `INSERT … ON CONFLICT DO NOTHING` (keyed by `sku`) so the catalog appears in the Cloud DB. Sample messages and subscribers won't be ported (they're not useful real data).

---

## Step 6 — Admin dashboard polish
- Replace the auto-generated SVG sidebar logo with the real `src/assets/curemed-logo.png` (already in the project).
- Remove the "🔒 Default password: `curemed-admin`" hint from the new login screen — replaced by the email/password + Google buttons.
- Tidy the sidebar header spacing so the logo sits cleanly above "Admin Dashboard".

---

## Out of scope (this round)
- Order management / checkout
- Multi-admin invite UI (you'll be the first admin; more can be added by inserting into `user_roles` later)
- Migrating any data sitting in your browser's localStorage today (it's only sample data — the seed will replace it)

## After approval
I'll switch to default mode and execute the migration, create the bucket, rewrite the data layer, redo admin auth + sidebar logo, and seed the products. Then I'll walk you through:
1. Creating your admin account on `/admin/login`.
2. Granting that account the `admin` role (one SQL insert I'll run for you).
3. A quick smoke test (load a brand page, submit the contact form, log into admin, edit a product image).
