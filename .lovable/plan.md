# Home page polish — 3 tasks

## 1. Restyle "Featured products" cards (Prismatic Glass Editorial)

Rework `FeaturedGlassCard` in `src/pages/CuremedHome.tsx` to match the selected direction. The marquee auto-scroll motion is untouched — only the card visuals change.

New card anatomy:
- Rounded `2.5rem` card on a solid `bg-card` surface with a thin `border-border` and a soft elevated shadow (lifts further on hover, `-translate-y-2`).
- **Image zone** (top ~300px): product image *contained* (not full-bleed) over a subtle diagonal brand-tint gradient, with the existing hover zoom and the existing loop/swap hover image behaviour preserved.
- **Glass info strip** (bottom, inset, rounded `2rem`, frosted blur): keeps the admin-controlled glass opacity. Contains:
  - brand eyebrow label (small, uppercase, brand color)
  - product name (1 line, `line-clamp-1`)
  - price in KD with optional struck-through original price
  - round add-to-cart button
- Discount badge moves to the top corner as a soft pill (RTL-aware placement).

Colors use semantic tokens (`bg-card`, `text-foreground`, `border-border`, `text-brand`, `bg-brand`) so it respects light/dark mode, RTL, and each brand's theme — not the literal teal/violet from the preview. Card footprint (~`w-72 md:w-80`) stays so the marquee layout is unchanged.

## 2. Fix "Shop by Category" auto-scroll on mobile

Root cause: the category row uses the JS-driven `AutoScrollMarquee` (writes `scrollLeft` every frame). On mobile it ends up frozen — no auto-scroll and no swipe — whereas the Featured row, which uses a pure CSS-animation marquee, scrolls fine on the same device.

Fix: switch `CategoryCarousel` (`src/components/site/CategoryCarousel.tsx`) to the same proven CSS-transform marquee approach the Featured row uses (the `.cat-marquee` keyframes already exist in `src/index.css`):
- When auto-scroll is enabled (admin flag): render the doubled track inside an `overflow-hidden` wrapper animated with the CSS `cat-marquee` animation, paused on hover. This works reliably on mobile.
- When the admin flag disables auto-scroll: render a plain horizontally-scrollable row (`overflow-x-auto`) so it can still be swiped.

This keeps the existing edge fade mask, palette tints, count badges, and the admin autoscroll toggle behavior intact.

## 3. Shorten FAQ question rows

In `src/components/site/FAQ.tsx`, halve the collapsed question row height by reducing the `AccordionTrigger` vertical padding from `py-6 md:py-8` to roughly half (`py-3 md:py-4`) and trimming the number-badge/heading scale slightly so each closed question takes about half its current height. Open-state answer spacing stays readable.

## Verification
- Build passes.
- Pending: Playwright check at mobile (390px) confirms the category row's scroll position advances over time.
- Pending: Visual screenshots of the Featured row (desktop + mobile) and the FAQ list confirm the new look and the reduced row height.

## Technical notes
- No backend/database/migration changes — this is frontend/presentation only.
- Files touched: `src/pages/CuremedHome.tsx`, `src/components/site/CategoryCarousel.tsx`, `src/components/site/FAQ.tsx` (and `src/index.css` only if the marquee keyframe needs a minor tweak).
