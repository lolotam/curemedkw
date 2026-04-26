## Goal
Move the slide indicator dots out of the hero image area so they no longer overlap text, CTAs, or important parts of the slide imagery. Place them in a clean strip directly **below** the hero section.

## Problem
Currently in `src/components/site/HeroSlider.tsx`, the dots are absolutely positioned at `bottom-6` inside the hero `<section>`. On many slides — especially after lowering the overlay opacity to show full-color images — the dots can land on top of product packaging, model faces, or subtitle text.

## Changes

### `src/components/site/HeroSlider.tsx`
1. **Wrap the current `<section>` in a fragment / outer container** so we can render the dots as a sibling underneath.
2. **Remove the absolutely-positioned dots block** from inside the hero section (the `<div className="absolute bottom-6 left-1/2 …">…</div>` group).
3. **Keep the prev/next chevron buttons** where they are (still useful inside the hero, vertically centered).
4. **Add a new dots strip below the hero**:
   - Rendered only when `count > 1`.
   - Centered horizontally, with vertical padding (`py-4 md:py-5`) and a neutral background that matches the page (`bg-background`) so it reads as a separate band, not part of the image.
   - Same active/inactive styling already in use:
     - active: `w-8 bg-brand`
     - inactive: `w-2 bg-foreground/30 hover:bg-foreground/60`
   - Preserve accessibility: `aria-label={`Go to slide ${i + 1}`}` and `aria-current` on the active dot.
5. **Keep the autoplay pause-on-hover** behavior tied to the hero `<section>` only (don't extend it to the dots strip, so hovering the dots doesn't pause).

### Result
- Hero imagery is fully visible end-to-end with no dots overlaying it.
- Dots sit in a clean, dedicated row right below the hero, aligned to page width.
- Behavior (click to jump, autoplay, prev/next arrows) is unchanged.

## Files to edit
- `src/components/site/HeroSlider.tsx`

No database, routing, or other component changes are needed. Pages that embed `<HeroSlider />` (Curemed home + brand pages) will pick this up automatically.