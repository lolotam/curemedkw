## Goal
Replace the 4-column grid of brand cards in the "Our Brands" section on `/curemed` with a single-row, **infinite auto-scrolling marquee** (continuous, seamless loop — not paginated).

## Changes

### 1. `src/index.css`
Add a `marquee` keyframe + utility for a smooth, infinite horizontal scroll:
```css
@keyframes marquee-x {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.animate-marquee {
  animation: marquee-x 40s linear infinite;
}
.animate-marquee-rtl {
  animation: marquee-x 40s linear infinite reverse;
}
```
- Pause on hover via `group-hover:[animation-play-state:paused]`.
- RTL direction uses the reversed animation so it visually flows right-to-left correctly.

### 2. `src/pages/CuremedHome.tsx` — "Our Brands" section
Replace the existing `<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">` block with a marquee:

- Outer wrapper: `relative overflow-hidden group` with edge fade masks (left/right gradient overlays for a polished look).
- Inner track: `flex w-max animate-marquee` (or RTL variant based on `dir` from `useI18n`).
- Render `BRAND_LIST` **twice** back-to-back inside the track. Because the track translates by `-50%`, the second copy seamlessly takes over → infinite loop with no jump.
- Each card keeps the same visual design (logo box on top, name + tagline + "Discover" CTA below) but with a fixed width (`w-72 md:w-80 shrink-0`) so they sit in one row regardless of viewport.
- Pause animation on hover: `group-hover:[animation-play-state:paused]`.
- Add `aria-hidden="true"` to the duplicated set for accessibility.

### Acceptance
- All 7 brand cards visible in a single row that auto-scrolls continuously and infinitely (no visible reset).
- Pauses when the user hovers.
- RTL (Arabic) scrolls in the natural reading direction.
- Subtle fade on left/right edges; cards retain current styling and link to their brand pages.

## Files to edit
- `src/index.css` (add marquee keyframes/utilities)
- `src/pages/CuremedHome.tsx` (replace grid with marquee track)