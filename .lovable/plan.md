## Plan — Product Categories System

### 1. Database (migration)

**New table `categories`:**
- `id` uuid PK
- `slug` text unique (URL-safe, e.g. `feet-care`)
- `name_en` text, `name_ar` text
- `image_url` text (1:1 image)
- `sort_order` int default 0
- `created_at`, `updated_at`
- RLS: public SELECT; admin INSERT/UPDATE/DELETE (using `has_role`)
- Trigger: `update_updated_at_column`

**Products table:**
- Add `category_id uuid REFERENCES categories(id) ON DELETE SET NULL`
- Keep existing `category` text column for backwards-compat / display fallback
- Add `tags text[]` is already present — keep as-is

**Storage:**
- Reuse `product-images` bucket with `categories/<id>/` prefix (or add a small `category-images` bucket — I'll add a dedicated `category-images` public bucket for clarity, with admin-only write RLS).

### 2. Data layer (`src/lib/db.ts`)

Add types + hooks:
- `Category { id, slug, nameEn, nameAr, imageUrl, sortOrder }`
- `useCategories()` — sorted by `sort_order`
- `useCategory(slug)`, `useCategoryById(id)`
- `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`, `useBulkDeleteCategories`
- `uploadCategoryImage(file, categoryId?)`
- Extend `Product` type with `categoryId?: string` and update `rowToProduct` / `productToRow`
- `useProductsByCategory(categoryId)`

### 3. AI extraction (`supabase/functions/extract-product`)

Extend the tool schema so the AI also returns:
- `category` (free text — existing)
- `tags: string[]` (3–8 short keywords)

Update `aiImport.ts` `ExtractedFields` and `AdminProductEditor.applyImported` to populate `tags` and (if a matching category slug exists) auto-link `category_id`.

### 4. Admin UI

**New page `src/pages/admin/AdminCategories.tsx`:**
- Table list with checkbox select-all, bulk delete, search
- Columns: image (1:1 thumb), EN name, AR name, slug, sort order, # products, actions
- "Add category" button → modal/inline editor with:
  - Name EN, Name AR, slug (auto from EN, editable)
  - 1:1 image upload (square crop hint, validated aspect)
  - Sort order
- Edit & delete per row; bulk delete bar like products page
- Add nav entry in `AdminLayout` (`Tags` icon) → `/admin/categories`
- Route in `App.tsx`

**Product editor (`AdminProductEditor.tsx`):**
- Replace free-text "Category" input with a `Select` of existing categories (plus "Create new…" inline)
- Add multi-input "Tags" (chip input)
- AI import populates both

### 5. Public site

**`src/components/site/CategoryCarousel.tsx` (new):**
- Auto-scrolling marquee/carousel of category cards (1:1 image + bilingual name)
- Cards link to `/category/<slug>`
- Mounted on `CuremedHome.tsx` (between brands and pillars) and on every `BrandPage.tsx` (above products)

**`src/pages/CategoryPage.tsx` (new):**
- Route `/category/:slug`
- Shows category banner (image + EN/AR name) + product grid using `useProductsByCategory`

**Brand page filter (`BrandPage.tsx`):**
- Add a left sidebar (mobile: collapsible) "Filter by → Areas/Categories" matching the screenshot style
- Checkbox list of categories that have ≥1 product in this brand, with counts
- Filters the brand product grid client-side
- Replace `AutoCarousel` with a responsive grid when filters are active

### 6. i18n

Add keys: `category.title`, `category.all`, `category.filterBy`, `category.areas`, `nav.categories`, etc., in `src/lib/i18n.tsx`.

### 7. QA

- Verify migration runs cleanly (additive — no breaking change to existing products)
- Verify RLS: anonymous can read categories, only admins can write
- Verify AI fallback chain still works after schema change
- Verify carousel auto-scrolls and pauses on hover
- Verify category page + brand-page filter render in EN and AR (RTL)

**Files created:**
- migration (categories table, category-images bucket + RLS, products.category_id column)
- `src/pages/admin/AdminCategories.tsx`
- `src/pages/CategoryPage.tsx`
- `src/components/site/CategoryCarousel.tsx`
- `src/components/admin/CategoryEditorDialog.tsx`

**Files edited:**
- `src/lib/db.ts`, `src/lib/aiImport.ts`, `src/lib/i18n.tsx`
- `src/App.tsx`, `src/components/admin/AdminLayout.tsx`
- `src/pages/CuremedHome.tsx`, `src/pages/BrandPage.tsx`
- `src/pages/admin/AdminProductEditor.tsx`
- `supabase/functions/extract-product/index.ts`