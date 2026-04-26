## Goal
On the `/curemed` "Shop by category" section, display **every active category** (parents *and* subcategories) and present them in a single-row, **infinite right-to-left auto-scroll** marquee.

## Root cause of the current bug
In `src/components/site/CategoryCarousel.tsx`, the list is filtered with:
```ts
const active = categories.filter((c) => c.isActive && !c.parentId);
```
The `!c.parentId` check excludes every subcategory, which is why only top-level categories ever render. We need to drop that condition so subcategories show up too.

## Proposed changes — `src/components/site/CategoryCarousel.tsx`

1. **Show every active category**
   - Replace the filter with `categories.filter((c) => c.isActive)` so both parents and subs are included.
   - Simplify the product-count logic: since each tile now represents a single category (no roll-up needed), count products whose `categoryIds` / `categoryId` directly match `c.id`. Remove the descendant-traversal map.

2. **Convert the grid into an infinite marquee**
   - Remove the `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` wrapper.
   - Wrap the track in an overflow-hidden container with edge fade masks (same `linear-gradient` mask technique used in the brands marquee) so cards fade softly at both ends.
   - Render the track as `flex w-max gap-5 md:gap-6 cat-marquee group-hover:[animation-play-state:paused]`.
   - **Duplicate the list** (`[...active, ...active]`) so the `translateX(-50%)` keyframe loops seamlessly. Mark the second copy with `aria-hidden="true"` and `tabIndex={-1}` for accessibility.
   - Give each card a fixed width (`w-44 sm:w-52 md:w-56 shrink-0`) so the track has a stable measurable size for the animation.
   - The existing `.cat-marquee` utility in `src/index.css` already animates `0 → -50%` (right-to-left) and auto-flips for `[dir="rtl"]`, so no CSS changes are needed.

3. **Preserve existing visuals**
   - Keep the pillar-tinted palette cycling, gradient halo on hover, tinted blob, square image panel, name + product-count pill, and the `-translate-y-2` hover lift exactly as they are today — only the layout container and the data filter change.

## Key snippet (illustrative)
```tsx
<div
  className="group relative overflow-hidden"
  style={{
    maskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
    WebkitMaskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
  }}
>
  <div className="cat-marquee flex w-max gap-5 md:gap-6 group-hover:[animation-play-state:paused]">
    {[...active, ...active].map((c, i) => {
      const palette = PALETTES[i % PALETTES.length];
      const isClone = i >= active.length;
      return (
        <div
          key={`${c.id}-${i}`}
          className="group/card relative shrink-0 w-44 sm:w-52 md:w-56"
          aria-hidden={isClone || undefined}
        >
          {/* existing card markup unchanged */}
        </div>
      );
    })}
  </div>
</div>
```

## Files to edit
- `src/components/site/CategoryCarousel.tsx`

No CSS, schema, or other component changes required.

## Acceptance criteria
- All active categories (parents + subcategories) appear in the section.
- Cards form a single horizontal row that auto-scrolls right-to-left continuously, looping seamlessly.
- Hovering pauses the animation; hover lift and palette accents still work.
- Section still respects RTL (Arabic) by reversing direction via the existing CSS rule.
