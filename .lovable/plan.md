## Goal

Extend `/admin/products` (and the `?brand=` filtered view) with more filters and clickable column-header sorting.

## New filters (in the filter Card above the table)

Add these alongside the existing search + brand chips:

1. **Category filter** — multi-select popover (reuse the same pattern as `InlineCategoriesCell`). Lists all active categories with product counts (counts respect the current brand filter). Matches a product if any of its `categoryIds` is selected.
2. **Price range filter** — two numeric inputs (Min KD / Max KD) in a popover, plus a "Clear" button. Filters by `product.price`.
3. **Featured filter** — segmented control: `All` / `Featured` / `Not featured`.
4. **Stock filter** — segmented control: `All` / `In stock` / `Low` / `Out of stock`.
5. **Active filters bar** — small chips showing each active filter with an `×` to remove, and a single "Clear all" button when 2+ filters are active.

Filter state is local React state (not URL) except `brand`, which already uses `?brand=`. All filters compose with the existing search box.

## Column sorting

Make these table headers clickable to sort, with a 3-state cycle: `none → asc → desc → none`. Show a ↑/↓ icon next to the active column.

Sortable columns:
- **#** (index — sorts by current sort key fallback; effectively disabled)
- **Product** — alphabetical by `name`
- **Brand** — alphabetical by brand display name
- **Category** — alphabetical by first category name (en)
- **Price** — numeric by `price`
- **Original price** — numeric by `originalPrice` (nulls last)
- **Stock** — by status order (in_stock → low_stock → out_of_stock)
- **Featured** — boolean (featured first / last)

When no sort is active, keep the current default (most-recently-updated first).

Implementation: a single `sort: { key, dir } | null` state. Clicking a header cycles the state. The existing `useMemo` list pipeline gets a final sort step.

## Files to change

- `src/pages/admin/AdminProducts.tsx` — add filter UI, filter logic, sort state, sortable `<th>` headers. Extract a small `SortableHeader` component locally.

No DB, schema, or API changes. No changes to other admin pages.

## Out of scope

- Persisting filters/sort to URL (only `brand` stays in URL).
- Server-side pagination.
- Changes to inline-edit cells or row actions.
