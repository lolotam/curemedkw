
## Goal
Connect your external Supabase project `curemedkw` (`ipkrqxrwxylmenidsuiy`) to this Lovable project and migrate the existing localStorage-based data layer to real Supabase tables, authenticated admin access, and proper image storage.

## Step 1 — Connect Supabase (native integration)
Lovable doesn't accept Supabase URL/keys pasted in chat — it uses an OAuth-style connect flow. After approving this plan, I'll trigger the Supabase connection prompt. You'll then:
1. Click **Connect Supabase** in the Lovable UI.
2. Authorize the integration.
3. Pick the **curemedkw** project from the list.

Once linked, Lovable auto-injects `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` and wires up the typed client at `src/integrations/supabase/client.ts`. The anon key you pasted will be picked up automatically — no need to hardcode it.

## Step 2 — Database schema (migrations)
Create the following tables in your Supabase project:

- **`products`** — id (uuid), brand (text), name, category, price (numeric), short_description, long_description, main_image (text URL), gallery (text[]), ingredients (text[]), benefits (text[]), usage, size, sku, stock_status (enum: in_stock/low_stock/out_of_stock), featured (bool), tags (text[]), created_at, updated_at.
- **`messages`** — id, name, email, phone, brand, subject, message, read (bool), created_at.
- **`subscribers`** — id, email (unique), created_at.
- **`user_roles`** — id, user_id (fk auth.users), role (enum: admin, user). Roles in a SEPARATE table per security best practices.
- **`has_role(uuid, app_role)`** — SECURITY DEFINER function for safe RLS checks.

RLS policies:
- `products` — public SELECT; INSERT/UPDATE/DELETE only for admins.
- `messages` — public INSERT (contact form); SELECT/UPDATE/DELETE only for admins.
- `subscribers` — public INSERT (newsletter); SELECT/DELETE only for admins.
- `user_roles` — only admins can read/manage.

## Step 3 — Storage
Create a public `product-images` bucket. Replace base64-in-localStorage uploads with real Supabase Storage uploads in `AdminProductEditor`. Store returned public URLs in `products.main_image` / `products.gallery`.

## Step 4 — Replace admin auth
Remove the hardcoded password (`src/lib/admin.ts`). Replace `/admin/login` with real Supabase email+password auth (and Google sign-in as a default). Gate the `/admin/*` routes by checking `has_role(user, 'admin')`. You'll bootstrap your own admin account by signing up once, then I'll insert a `user_roles` row granting you admin (via the data tools after connection).

## Step 5 — Rewrite data layer
Rewrite `src/lib/db.ts` to call Supabase instead of localStorage:
- `products.list/byBrand/featured/get/create/update/remove` → Supabase queries.
- `messages.list/create/setRead/remove/removeMany` → Supabase queries.
- `subscribers.list/add/remove` → Supabase queries.
- Replace the `useDbVersion` event bus with React Query (`@tanstack/react-query` is already installed) for cached, reactive data.

Public pages (`CuremedHome`, `BrandPage`, `ProductDetail`) and admin pages (`AdminOverview`, `AdminProducts`, `AdminProductEditor`, `AdminMessages`, `AdminSubscribers`) will be updated to use the new async hooks. Loading states and error toasts added where needed.

## Step 6 — Seed data
Port the existing 20-product seed (`src/lib/seed.ts`) into a one-time INSERT against the `products` table so your sample catalog appears in Supabase. Existing brand/product images stay as the generated SVG placeholders until you upload real ones via the admin editor.

## Out of scope (for this round)
- Real payment / checkout
- Order management
- Multi-admin invitations UI (you'll be the first admin; more can be added later)

## After approval
I'll switch to default mode and:
1. Trigger the Supabase connect prompt.
2. Wait for you to authorize and pick `curemedkw`.
3. Run the migration, create the storage bucket, rewrite the data layer, and seed.
4. Walk you through creating your admin account and confirm everything works end-to-end.
