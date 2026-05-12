## Goal

On every `/categories/:slug` page, remove the large image + title + product-count layout block (the grid currently at lines 50–79 of `src/pages/CategoryPage.tsx`) and replace it with a **manual-scroll subcategory carousel** placed directly under the banner — using the same tile design as the category cards on the brand pages (`CategoryCarousel`).

## Behavior

- A subcategory = any active category whose `parentId` equals the current category's `id`.
- If the current category has subcategories → render the carousel.
- If it has none → render nothing in that slot (no empty section, no fallback heading).
- Tiles are clickable and link to `/categories/<subcategory-slug>` (which already works for any category slug).
- Manual scrolling only (prev/next arrows + drag/swipe), **no auto-scroll marquee**.

## Files to change

**`src/pages/CategoryPage.tsx`**
- Remove the entire `<div className="grid md:grid-cols-[260px_1fr] ...">` block (the square image + title + Arabic name + product count).
- Keep the banner and the breadcrumb strip exactly as they are.
- Keep the products grid below.
- Add a new `useCategories()` call, derive `subcategories = categories.filter(c => c.parentId === category.id && c.isActive)` sorted by `sortOrder` then `nameEn`.
- Insert a new `<SubcategoryCarousel categories={subcategories} />` between the breadcrumb strip and the products section, only when `subcategories.length > 0`.

**`src/components/site/SubcategoryCarousel.tsx`** (new)
- Wraps shadcn `Carousel` (`@/components/ui/carousel`) with `opts={{ align: "start", dragFree: true }}` and visible `CarouselPrevious` / `CarouselNext` arrows.
- Each `CarouselItem` uses `basis-auto` so tiles keep a fixed width (`w-44 sm:w-52 md:w-56`) — the same dimensions used by `CategoryCarousel` tiles on brand pages.
- Reuse the visual styling of the existing brand-page category tile (gradient halo, palette cycling, square tinted image panel, name + product-count pill). Easiest path: extract the per-tile JSX from `CategoryCarousel` into a small shared `CategoryTile` and consume it from both components.
- Product count per subcategory computed the same way as in `CategoryCarousel` (via `useProducts()`).

## Out of scope

- No DB changes.
- No changes to `CategoryCarousel` behavior on home/brand pages beyond extracting the tile component for reuse.
- No changes to the products grid section that follows.
