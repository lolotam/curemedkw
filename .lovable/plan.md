## Goal

Make the admin "Product card hover" setting (First & second image / Infinite loop through all images) apply to the home page Featured carousel as well. The setting already drives `ProductCard` (used by Brand pages, Category pages, and Product detail related lists), but the home Featured carousel uses a separate `FeaturedGlassCard` that only ever shows `product.mainImage`.

## Change (single file: `src/pages/CuremedHome.tsx`)

In `FeaturedGlassCard`:

1. Import and read the same hover config used by `ProductCard`:
   - `useProductCardHover` + `DEFAULT_PRODUCT_CARD_HOVER` from `@/lib/db`.
2. Build the same unique image list: `[mainImage, ...gallery]` deduped via `useMemo`.
3. Add the same `hovered` state with `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` on the `<Link>`.
4. Render images using the same two-mode logic as `ProductCard`:
   - **swap mode (default):** keep current main `<img>`, add a second `<img>` overlay that fades in on hover (only if a 2nd image exists). Preserves the existing `object-cover` + `group-hover/card:scale-105` zoom.
   - **loop mode:** stack all images absolutely; cycle `loopIdx` with a `setInterval` based on `hoverCfg.intervalSec` (min 300 ms), same cleanup pattern as `ProductCard`. Reset to 0 on mouse leave.
5. Keep all existing styling untouched: full-bleed image area, top gradient, discount badge, frosted info strip, discover link, add-to-cart button.

## Out of scope

- `ProductCard` (already supports both modes).
- Admin Flags UI (already exposes the two options).
- No changes to `db.ts`, brand pages, or category pages.

## Notes

- `Product` type already exposes `mainImage` and `gallery`, same shape used by `ProductCard`.
- Hooks are called unconditionally at the top of `FeaturedGlassCard`, preserving rules-of-hooks.
