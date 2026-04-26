# Show all categories in brand landing pages

## Pages affected
- `/australian-bodycare`
- `/kapiva`
- `/flexitol`
- `/nada`

All four are rendered by **`src/pages/BrandPage.tsx`**.

## Current behavior
The left sidebar filter only lists categories that have at least one product in the current brand. Empty categories are hidden entirely:

```tsx
return categories
  .filter((c) => counts.has(c.id))   // ← removes empty categories
  .map((c) => ({ ...c, count: counts.get(c.id) || 0 }));
```

## Desired behavior
Show **all active categories** (the 6 in the database: Body, Face & Lips, Feet, Hands, Kids, Scalp) in every brand's filter, with a count badge — including `(0)` when the brand has no products in that category.

## Plan

### 1. `src/pages/BrandPage.tsx` — show all categories
- Remove the `.filter((c) => counts.has(c.id))` step so the full categories list is rendered.
- Keep filtering to **active** categories only (`c.isActive !== false`) to avoid showing disabled ones.
- Sort by `sortOrder` then `nameEn` for a stable order (matches admin order).
- Each row keeps the existing `(N)` badge — it will naturally read `(0)` for empty categories thanks to `counts.get(c.id) || 0`.

### 2. Visual treatment for zero-count rows
- When `count === 0`:
  - Render the checkbox **disabled** (can't filter to an empty set).
  - Apply `opacity-60` / `text-muted-foreground` to the row so users see at a glance that nothing is available there.
  - Keep the `(0)` badge visible so the user has a clear signal.

### 3. Sidebar visibility condition
- Currently the sidebar only renders when `brandCategories.length > 0`. Since we'll always have categories now, the sidebar will always render on brand pages that have at least one product. Keep the existing `brandProducts.length > 0` outer guard so brand-new brands with zero products still render cleanly.

### 4. No changes needed
- `filteredProducts` logic stays the same — selecting a zero-count category would yield an empty list, but the disabled checkbox prevents that.
- No DB or schema changes.
- No changes to other brand assets, hero, or carousel.

## Files to edit
- `src/pages/BrandPage.tsx` (only file)
