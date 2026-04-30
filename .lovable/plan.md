# Inline Brand + Categories editing in Admin Products table

## Goal
On `/admin/products`, make the **Brand** and **Category** columns editable directly from the table — no need to open the product editor.

## UX

### Brand column (single-select)
- Click the brand cell → compact dropdown opens listing all brands from `BRAND_LIST`.
- Picking a brand updates the row immediately (optimistic) and shows a toast "Brand updated".
- Spinner replaces the chevron while saving.

### Category column (multi-select)
- Click the cell → popover with a searchable checkbox list of all categories (from `useCategories()`).
- User can tick/untick multiple. A "Done" button (or click-outside) commits the change.
- Cell displays:
  - `—` when no categories
  - The single category name when 1 selected
  - `Skin care +2` style chip-with-count when more than 1
- Toast: "Categories updated".

Both stay quiet (no confirmation modal) and use the existing `useUpdateProduct` mutation, which already syncs `category_id` + `product_categories` link rows.

## Implementation (technical)
File: `src/pages/admin/AdminProducts.tsx`

1. Add imports: `Popover, PopoverTrigger, PopoverContent`, `Select, SelectTrigger, SelectContent, SelectItem, SelectValue` from shadcn ui; `useCategories` from `@/lib/db`; `ChevronDown, Check` from lucide.
2. Fetch `const { data: categories = [] } = useCategories();` once at top of `AdminProducts`.
3. Replace `<td>{BRANDS[p.brand].name}</td>` with `<InlineBrandCell product={p} />`.
4. Replace `<td>{p.category}</td>` with `<InlineCategoriesCell product={p} categories={categories} />`.

5. `InlineBrandCell` — uses shadcn `Select`:
   - `value={p.brand}`, `onValueChange={(b) => updateProduct.mutateAsync({ id: p.id, patch: { brand: b as BrandKey } })}`.
   - Compact trigger styled like the existing inline editors (`h-8`, ghost border).
   - Loading spinner overlay while pending.

6. `InlineCategoriesCell` — uses `Popover` + a small list of `Checkbox` rows:
   - Local draft `Set<string>` initialized from `product.categoryIds` (fallback to `[product.categoryId]` if empty).
   - On popover close (or "Done" click), if the set differs from current, call `updateProduct.mutateAsync({ id: product.id, patch: { categoryIds: Array.from(draft) } })`.
   - Trigger button shows the summary text described above.
   - Includes a small search input filtering categories by `nameEn`.

7. Both new cells stop event propagation so they don't trigger row-level handlers.

## Out of scope
- No DB schema changes (uses existing `brand`, `category_id`, `product_categories`).
- No changes to Arabic category text or to the product editor page.
- No changes to filters or column headers.