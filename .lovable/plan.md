# Featured Products Carousel on Home Page

Add a shop-style horizontal carousel of featured products on `/curemed`, automatically populated from the products database. Any product marked `featured = true` in the admin will show up here.

## What the user will see

A new "Featured Products" section on the Curemed home page (replacing the current text-only marquee spotlight) that looks and feels like a shop:

- Section header with title (EN/AR) and subtitle.
- Horizontal slider showing product cards (image, brand, name, price/discount badge, add-to-cart button) — same `ProductCard` component already used across the site, so styling stays consistent.
- Left/right arrow navigation buttons.
- Dot/scroll indicators at the bottom.
- Responsive: 2 cards on mobile, 3 on tablet, 4–5 on desktop.
- Smooth swipe on touch devices.
- "View all" link that goes to a filtered product listing (all featured items).
- If no products are flagged featured, the section is hidden automatically.

## How featured products work (already in place)

- The `products` table already has a `featured` boolean column.
- Admin can toggle a product as featured from `/admin/products` and the product editor.
- The `useFeaturedProducts()` hook in `src/lib/db.ts` already fetches them.

The new section just consumes that hook — no DB changes required.

## Technical details

### Files

- **New:** `src/components/site/FeaturedProductsCarousel.tsx`
  - Uses the existing shadcn `Carousel` (Embla-based) from `src/components/ui/carousel.tsx`.
  - Renders each item with `<ProductCard product={p} />` from `src/components/site/ProductCard.tsx` for visual consistency with the rest of the shop.
  - Configures Embla with `align: "start"`, `loop: true`, `direction` driven by `useI18n()` lang for RTL support.
  - Responsive item widths via Tailwind: `basis-1/2 sm:basis-1/3 lg:basis-1/4 xl:basis-1/5`.
  - `CarouselPrevious` / `CarouselNext` buttons, plus a small dot indicator row tied to Embla's `selectedScrollSnap`.
  - "View all" link → `/curemed/featured` (or existing search/category route if preferred).

- **Edit:** `src/pages/CuremedHome.tsx`
  - Remove the current marquee-based "spotlight" block.
  - Insert `<FeaturedProductsCarousel />` in its place, between the Pillars section and Testimonials.
  - Keep the section hidden when the hook returns an empty array.

- **Edit:** `src/lib/i18n.tsx`
  - Add translation keys: `featured.title`, `featured.subtitle`, `featured.viewAll` for both EN and AR.

### Data flow

```text
admin toggles "featured" on product
           │
           ▼
products.featured = true   (Supabase)
           │
           ▼
useFeaturedProducts()  →  React Query cache
           │
           ▼
FeaturedProductsCarousel  →  ProductCard (links to /:brand/product/:id)
```

### Behavior notes

- Reuses `ProductCard`, so price hiding, discount badges, "Add to cart", featured star, and brand theming all work out of the box.
- No new RLS or storage changes needed.
- React Query auto-refetches on focus, so newly featured products appear without a manual reload.

## Out of scope

- Auto-rotating slides (carousel is user-controlled; can be added later if desired).
- A separate "featured" landing page (the "View all" link can point to an existing filter route — confirm during implementation).
