## Goal

Add a configurable product-card hover animation, plus admin controls in `/admin/flags` to pick between the existing two-image swap and a new infinite gallery loop with an adjustable interval.

## Behavior

- **Mode 1 — "First & second image only"** (current behavior): on hover, fade from main image to the second gallery image. On unhover, fade back.
- **Mode 2 — "Infinite loop through all images"**: on hover, cycle through `[mainImage, ...gallery]` (deduped) one by one every N seconds (admin-configured, default 1s). On unhover, reset to main image. If the product has only one image, do nothing.

Both modes apply globally to every `ProductCard` on the storefront.

## Admin UI — `src/pages/admin/AdminFlags.tsx`

Add a new card `ProductCardHoverCard` (placed near other site-wide toggles, e.g. above `PicsartEngineCard`):

- Radio group with 2 options:
  1. First & second image only
  2. Infinite loop through all images
- When option 2 is selected, show a numeric input (seconds between images, min 0.5, max 10, step 0.5, default 1).
- Saves immediately via `useUpdateSiteSetting` (same pattern as `PicsartEngineCard` / `HomeCarouselAutoscrollCard`).

## Setting storage — `src/lib/db.ts`

Add one new site setting key + hook:

```ts
export const PRODUCT_CARD_HOVER_KEY = "product_card_hover";
export type ProductCardHover = {
  mode: "swap" | "loop";
  intervalSec: number; // used only when mode === "loop"
};
export const DEFAULT_PRODUCT_CARD_HOVER: ProductCardHover = { mode: "swap", intervalSec: 1 };
export function useProductCardHover() {
  return useSiteSetting<ProductCardHover>(PRODUCT_CARD_HOVER_KEY, DEFAULT_PRODUCT_CARD_HOVER);
}
```

No DB migration — `site_settings` already stores JSON keys.

## Card component — `src/components/site/ProductCard.tsx`

Replace the current pure-CSS hover swap with a small stateful image layer:

- Read `useProductCardHover()`.
- Build `images = [product.mainImage, ...gallery].filter(unique & truthy)`.
- Track `hovered` (onMouseEnter/Leave, also onFocus/Blur for keyboard) and `index`.
- **Mode `swap`**: keep current two-image cross-fade behavior (use `images[0]` and `images[1]` if it exists). Visual output identical to today.
- **Mode `loop`** with ≥2 images: while hovered, `setInterval(() => setIndex(i => (i+1) % images.length), intervalSec*1000)`. On leave, clear interval and reset index to 0. Render a single `<img>` whose `src` is `images[index]` with a short opacity transition for a smooth fade.
- Clean up interval on unmount and when hover toggles off.

No change to layout, badges, price block, or AddToCartButton — only the image layer logic.

## Out of scope

- No per-brand or per-product override.
- No new DB tables/migrations.
- No changes to admin product editor or gallery management.

## Files touched

- `src/lib/db.ts` — add `PRODUCT_CARD_HOVER_KEY`, type, default, hook.
- `src/pages/admin/AdminFlags.tsx` — add `ProductCardHoverCard`.
- `src/components/site/ProductCard.tsx` — implement two hover modes driven by the setting.
