## Plan: 3 enhancements

### 1. Show/Hide password toggle on `/admin/login`
**File:** `src/pages/admin/AdminLogin.tsx`
- Add a `showPassword` state (default `false`).
- Wrap the password `Input` in a `relative` container; change `type` to `showPassword ? "text" : "password"`.
- Add an absolute-positioned eye toggle button (uses `Eye` / `EyeOff` from `lucide-react`) on the trailing edge inside the input (right padding `pr-10`).
- Button is `type="button"` so it never submits the form; `aria-label` toggles between "Show password" / "Hide password".

### 2. Multiple categories per product (admin editor + filtering)

**Database (new migration):**
- Create junction table `public.product_categories` with columns:
  - `product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE`
  - `category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE`
  - `PRIMARY KEY (product_id, category_id)`
  - `created_at timestamptz DEFAULT now()`
- Enable RLS:
  - Public `SELECT` (categories already public).
  - Admin-only `INSERT`/`DELETE` via existing `has_role(auth.uid(), 'admin')` pattern (matches policies on `products`).
- Backfill: for every product where `products.category_id IS NOT NULL`, insert a row into `product_categories`. The existing single `category_id` column is kept for backward compatibility (used as the "primary" category for sorting/breadcrumbs).
- Indexes on `(category_id)` and `(product_id)`.

**Data layer (`src/lib/db.ts`):**
- Extend the `Product` type with `categoryIds: string[]` (in addition to existing `categoryId` which becomes the "primary" category).
- Update `useProduct` / `useProducts` queries to also fetch joined `product_categories` rows; map into `categoryIds`.
- Update `useCreateProduct` and `useUpdateProduct` to:
  - Insert/update the product row (still writes `category_id` = first id in `categoryIds` for the legacy primary).
  - After insert/update, sync `product_categories`: delete existing rows for that product, insert the new set (transactional via two awaited calls; acceptable for admin flow).
- Update `useProductsByCategory` to query products via `product_categories` (so a product appearing in multiple categories is returned for each).

**Admin editor (`src/pages/admin/AdminProductEditor.tsx`):**
- Replace the single `Select` with a multi-select control: a popover containing a searchable checkbox list of categories (with "+ Create new category…" action preserved).
- Display selected categories as removable badges above the popover trigger.
- Form state stores `categoryIds: string[]`; `categoryId` (primary) is auto-set to the first selected id, kept in sync, and used for legacy display fields.
- Save flow unchanged from the user's perspective (Save button), but now persists via the data-layer changes above.

**Frontend filter (`src/pages/BrandPage.tsx`):**
- Use `categoryIds` (fallback to `[categoryId]` when empty) when computing per-category counts and the active filter intersection so a product in multiple categories shows up under each.

### 3. Styled customer name in fake order notifications
**File:** `src/components/site/LiveOrdersToast.tsx`
- Refactor the rendered toast body so the customer name is its own `<span>` with `font-bold text-brand` (matches Curemed brand color), and the area name uses a subtle accent (`font-medium text-foreground`). Surrounding sentence text stays `text-muted-foreground` for hierarchy.
- Both Arabic and English variants get the same treatment, with proper RTL ordering preserved by using JSX fragments instead of plain template strings:
  - EN: **{name}** from *{area}* just ordered {product.name}
  - AR: **{name.ar}** من *{area.ar}* طلب {productNameAr} قبل لحظات
- No changes to interval, frequency, or product-selection logic.

### Files to be edited
- `src/pages/admin/AdminLogin.tsx`
- `supabase/migrations/<new>.sql` (new junction table + RLS + backfill)
- `src/lib/db.ts`
- `src/pages/admin/AdminProductEditor.tsx`
- `src/pages/BrandPage.tsx`
- `src/components/site/LiveOrdersToast.tsx`

`src/integrations/supabase/types.ts` will regenerate automatically after the migration.
