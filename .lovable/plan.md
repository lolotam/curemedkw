# Dedicated category pages with editable banner

Each category will have its own URL (`/categories/:slug`) and a small **19:6 hero banner** that admins can set from the category edit form — either by uploading a file (stored in Lovable Cloud storage) or by pasting an external URL.

## 1. Database

Add one column to `categories`:

- `banner_url TEXT NOT NULL DEFAULT ''`

(Migration only; existing categories keep working — empty banner just hides the hero.)

## 2. Storage

Reuse the existing public `category-images` bucket. New uploads from the banner picker go under a `banners/` prefix to keep them tidy. No new bucket / RLS needed.

## 3. Routing

In `src/App.tsx`:

- Add `<Route path="/categories/:slug" element={<CategoryPage />} />`
- Keep the old `/category/:slug` route as an alias (so existing links don't break).

Update internal links to use the new path:

- `src/components/site/CategoryCarousel.tsx` → `to={"/categories/" + c.slug}`
- Any other `/category/${slug}` references found in the codebase.

## 4. Data layer (`src/lib/db.ts`)

- Add `bannerUrl: string` to the `Category` interface.
- Map `banner_url` ↔ `bannerUrl` in `rowToCategory` / `categoryToRow`.
- Add `uploadCategoryBanner(file)` helper that uploads to `category-images/banners/<uuid>.<ext>` and returns the public URL (mirrors the existing `uploadCategoryImage`).

## 5. Admin form (`src/pages/admin/AdminCategories.tsx`)

In the category edit dialog, add a **Hero banner (19:6)** section under the existing image field:

- 19:6 aspect-ratio preview box (empty placeholder when none).
- "Upload banner" button → calls `uploadCategoryBanner`.
- "Or paste image URL" text input bound to `bannerUrl`.
- Clear button to remove the banner.
- Helper text: "Recommended: 1900×600 (19:6 aspect ratio)".

Defaults `bannerUrl: ""` in the new-category form state.

## 6. Public category page (`src/pages/CategoryPage.tsx`)

Above the existing breadcrumb / grid, render the banner when `category.bannerUrl` is set:

```text
+----------------------------------------------------+
|  [ banner image — aspect-[19/6], object-cover ]    |
|  category title overlay (gradient at bottom)       |
+----------------------------------------------------+
```

If no banner is set, fall back to the current header (no visual regression).

## Out of scope

- Per-category SEO meta / JSON-LD (can come later).
- Admin bulk banner editor.
- Replacing the existing square thumbnail (`imageUrl`) — that stays for the carousel tiles.
