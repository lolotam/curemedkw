# Inline Featured toggle in Admin Products table

## Goal
On `/admin/products`, turn the **Featured** column into a one-click toggle. Clicking the star in a row immediately flags/unflags that product as featured — which controls whether it appears in the **Featured Products carousel** on the `/curemed` home page. No need to open the product editor.

## UX
- Replace the read-only star with a clickable star button in each row.
- **Filled amber star** = featured (shown on home carousel).
- **Outline grey star** = not featured. Hovering shows a faint amber preview.
- Click toggles instantly with optimistic UI; a tiny spinner replaces the star while saving.
- Toast confirms: "Added to featured" / "Removed from featured".
- Tooltip on hover: "Click to feature on home page" / "Click to remove from featured".
- Column header stays "Featured".

## Implementation (technical)
File: `src/pages/admin/AdminProducts.tsx`
- Add a small `FeaturedToggleCell` component (same file, like `InlinePriceCell`).
- It receives `{ id, featured }` and uses the existing `useUpdateProduct` mutation:
  ```ts
  updateProduct.mutateAsync({ id, patch: { featured: !featured } })
  ```
- Renders a `<button>` with `Star` (lucide) — `fill-amber-400 text-amber-400` when featured, `text-muted-foreground` otherwise, with `hover:text-amber-400` for affordance.
- While the mutation is pending for that row, show `Loader2` spinner instead of the star and disable the button.
- Replace the current static `{p.featured && <Star ... />}` cell with `<FeaturedToggleCell id={p.id} featured={p.featured} />`.
- Stop event propagation so the row's other interactions aren't triggered.

## Out of scope
- No DB schema changes (the `featured` boolean already exists on `products` and the home carousel already reads it).
- No changes to filters, brand chips, or the rest of the table.
- No changes to the home page — it already renders featured products.