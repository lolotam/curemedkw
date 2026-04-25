
# Remove static hero fallback on /curemed — show only admin slides

## Goal
Remove the hardcoded hero on `/curemed` (the "Your trusted partner in healthcare solutions" headline + subtitle + 2×2 brand cards grid) so the page shows **only** the slides configured in **Admin → Landing Pages → Curemed (Main)**.

## Root cause
`src/pages/CuremedHome.tsx` passes a `fallback` prop to `<HeroSlider pageKey="curemed" fallback={...} />`. That fallback contains the entire static hero (brand chip, `t("hero.title")`, `t("hero.subtitle")`, CTA buttons, and the `BRAND_LIST` grid). `HeroSlider` renders this fallback whenever the `hero_slides` table returns zero active slides for `page_key='curemed'`, which is why the old design keeps appearing.

## Changes

### 1. `src/pages/CuremedHome.tsx`
- Delete the entire `fallback={ <section className="relative overflow-hidden bg-brand-soft"> … </section> }` JSX passed to `HeroSlider`.
- Replace the call with `<HeroSlider pageKey="curemed" />` (no fallback prop).
- Remove the now-unused `getBrandLogo` import. Keep `Link`, `Button`, `ArrowRight`, `BRAND_LIST` — they are still used by the "Our Brands" section further down the same file.
- Leave every other section intact (Our Brands grid, Pillars, Featured products carousel, Testimonials, FAQ, Contact, Newsletter).

### 2. `src/components/site/HeroSlider.tsx`
- Make the empty-state branch explicitly return `null` when `slides.length === 0` and no `fallback` was provided (instead of rendering `<>{fallback}</>` with `fallback` undefined). This keeps the existing brand-page fallbacks working but produces a clean empty area on `/curemed` before any slide is uploaded.
- Keep the loading skeleton (`min-h-[60vh] bg-brand-soft animate-pulse`) so there's no layout jump while the slides query resolves.

### 3. Out of scope (not changed)
- Brand pages (`/flexitol`, `/kapiva`, `/nada`, `/australian-bodycare`) — their fallbacks stay so they still render a hero before slides are added.
- Admin landing-page editor, `hero_slides` table, `hero-media` storage bucket, translations.

## Result
- With slides configured for Curemed → only the admin-managed slider shows at the top.
- With no slides yet → hero area is empty and the page begins at "Our Brands". The user can then upload slides in **Admin → Landing Pages → Curemed (Main)** and they will appear immediately at the top.
