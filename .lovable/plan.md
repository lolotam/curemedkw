
## Plan: Logo replacement, full-width landing, and seamless marquee loop

### 1. Replace the Curemed logo (header, footer, admin)
- Copy the uploaded `user-uploads://curmed_3d_logo500-200.png` to `src/assets/curemed-logo.png` (overwrite).
- Since `SiteHeader.tsx`, `SiteFooter.tsx`, and `AdminLayout.tsx` all import from `@/assets/curemed-logo.png`, swapping the file updates every location automatically — no code changes needed.
- Bump the header logo height (`h-20` → `h-24` if needed) only if the new wider/3D logo looks cramped after preview.

### 2. Make the landing page full screen (edge-to-edge)
The `/curemed` page currently constrains every section inside `.container` (max-width 1400px with 2rem padding).

- In `src/pages/CuremedHome.tsx`, replace the `container` wrapper on the **full-width sections** (Brands marquee header, Pillars, Featured carousel, Testimonials/FAQ/Contact/Newsletter wrappers where applicable) with a full-bleed `w-full px-4 md:px-8` layout so the page uses the entire viewport width.
- Hero (`HeroSlider`) and the marquee strips are already full-bleed — leave them.
- Inner content (text blocks, grids) gets `max-w-screen-2xl mx-auto` only where readability requires it (headings, copy), so backgrounds extend edge-to-edge while text stays centered.

### 3. Fix the seamless infinite loop on both marquees
**Root cause:** The current implementation doubles the array and animates `translateX: 0 → -50%`. With `gap-5` between items, the gap between the **last item of set 1** and **first item of set 2** equals the gap, but when the animation wraps back to `0`, there is no gap before the first item — creating a visible "jump"/end effect. Same for the categories carousel.

**Fix (`src/index.css` + both components):**
- Move the gap from CSS `gap-*` to per-item right margin (e.g. `mr-5 md:mr-6` on each card) so the spacing is **part of each item's width**. This makes the doubled track perfectly tileable: scrolling exactly `-50%` lines the cloned set up identically with the original, including the spacing before each card.
- Remove `gap-5` / `gap-5 md:gap-6` from the marquee track in:
  - `src/pages/CuremedHome.tsx` (brands marquee)
  - `src/components/site/CategoryCarousel.tsx` (categories marquee)
- Keep the existing `marquee` and `cat-marquee` keyframes (they already animate `0 → -50%`, which is the correct seamless distance once gap is internalized).
- Keep `[...list, ...list]` duplication and `aria-hidden` on clones.
- Optionally slow down to `60s` for a calmer loop.

### Files to edit
- `src/assets/curemed-logo.png` (overwrite via copy)
- `src/pages/CuremedHome.tsx` (full-width layout + marquee gap fix)
- `src/components/site/CategoryCarousel.tsx` (marquee gap fix)

### Result
- New 3D Curemed logo appears in site header, footer, and admin sidebar.
- Landing page sections stretch edge-to-edge across the full viewport.
- Both "Shop by category" and "Our brands" marquees scroll truly infinitely — no visible end/jump as cards exit left and re-enter from the right.
