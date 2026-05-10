# Show discounted prices + add discount filter + admin price validation

## Why nothing currently shows as "discounted"

- `ProductCard.tsx` already has discount logic (strike-through + red `-XX%` badge) — but it only triggers when `originalPrice > price`.
- `AdminProductEditor.tsx` has **no input for Original Price** — only `Price (KD)`. So no product in the database has an `originalPrice` set, and every card/page falls back to showing a single price.
- `ProductDetail.tsx` doesn't render `originalPrice` at all (only `product.price`).

So three changes are needed.

## 1. Admin editor: add Original Price input with live validation

File: `src/pages/admin/AdminProductEditor.tsx`

- Add a new field next to `Price (KD)`: **Original Price (KD)** bound to `form.originalPrice` (already in the form type / DB column `original_price`).
- Validation rules (live, while editing — block save, show inline red error, no toast spam):
  - If `originalPrice` is set and `originalPrice <= price` → error: *"Original price must be higher than the discounted price."*
  - If user edits `price` to a value `>= originalPrice` (when originalPrice set) → same error on the price field.
  - Empty / 0 originalPrice = no discount, no error (allowed — means no sale).
- Disable the Save button while the error is active.
- Show a small live preview underneath: *"Discount: -23% (was KD 12.99 → KD 9.99)"* when valid.

## 2. Product detail page: show both prices + % off

File: `src/pages/ProductDetail.tsx` (lines 101-108 block)

When `originalPrice > price` and not `priceHidden`, render:

- Big bold current `price` in red (or `text-destructive`).
- Strike-through `originalPrice` in muted color next to it.
- A red pill badge: `-XX% OFF` and an `EN/AR` "You save KD X.XX" line.
- Falls back to current single-price layout when no discount.

Use the same calc already in `ProductCard`:
`pct = Math.round((1 - price / originalPrice) * 100)`.

## 3. Brand page: discount % filter

File: `src/pages/BrandPage.tsx`

Add a new filter block in the existing left sidebar (under the categories block), labeled **Discount**:

- Checkboxes (single-select via radio-style state, or multi-select OR'd):
  - Any (default)
  - 10% or more
  - 20% or more
  - 30% or more
  - 50% or more
  - On sale (any discount > 0)
- Apply filter inside the existing `filteredProducts` useMemo:
  `pct = originalPrice > price ? (1 - price/originalPrice)*100 : 0` and keep products where `pct >= threshold`.
- "Clear" button already there clears categories — extend it to also clear the discount filter.

Add i18n keys: `filter.discount`, `filter.discount.any`, `filter.discount.10`, `filter.discount.20`, `filter.discount.30`, `filter.discount.50`, `filter.discount.onSale`, `discount.save`, `discount.off` (EN + AR) in `src/lib/i18n.tsx`.

## 4. ProductCard

Already shows discount correctly — no change needed. Once admins set `originalPrice` on a product, the card will automatically render the strike-through, current price, and `-XX%` badge.

## Out of scope

- No DB migration (column `original_price` already exists, nullable numeric).
- No edge-function or backend change.
- No change to checkout/cart math (they already use `product.price` which is the discounted price).

## Files touched

- `src/pages/admin/AdminProductEditor.tsx` — add input + validation + disable save
- `src/pages/ProductDetail.tsx` — render dual price + badge
- `src/pages/BrandPage.tsx` — add discount filter UI + filter logic
- `src/lib/i18n.tsx` — new translation keys (EN + AR)
