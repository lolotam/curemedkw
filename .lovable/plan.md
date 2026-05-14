## Goal
On hover of a product card (used by brand pages, category pages, featured carousel, home), cross-fade to the next image from the product's gallery. On unhover, return to the main image. If the product has no additional gallery images, keep showing the same image (no swap).

## Scope
Single file: `src/components/site/ProductCard.tsx`. All listing surfaces (BrandPage, CategoryPage, CuremedHome, ProductDetail related, featured carousel) reuse this component, so one edit covers every requested location.

## Implementation
In `ProductCard.tsx`, inside the `aspect-square` image wrapper:

1. Compute `secondImage = product.gallery?.find(u => u && u !== product.mainImage)` — the first gallery image that differs from the main image.
2. Render two stacked `<img>` elements (absolute positioned inside the wrapper, which becomes `relative`):
   - Base: `product.mainImage`, always visible.
   - Hover: `secondImage` (only rendered when it exists), `opacity-0 group-hover:opacity-100 transition-opacity duration-500`.
3. Keep the existing `group-hover:scale-105` zoom on both images so the current motion is preserved.
4. Preserve `loading="lazy"`, alt text, dimensions, and the existing badges (Featured / discount %). Badges already rely on the parent `Link` being `relative` — keep that.

No changes to data fetching, types, or other components. RTL, theming, and accessibility stay intact.

## Out of scope
- Cycling through more than one extra image.
- Touch/tap behavior on mobile (hover only, matches request).
- Admin product editor cards.