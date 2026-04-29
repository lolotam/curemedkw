# Resize Hualunhongli brand card logo to match other brands

## Problem

On `/curemed`, the brands marquee (`#brands` section) renders identical card containers for every brand. All cards use the same outer dark panel (`min-h-[140px]`) and inner white logo tile (`min-h-[120px]`). However, the **Hualunhongli** logo PNG has very little internal whitespace and a wider aspect ratio, so its image visually fills the white tile edge-to-edge while other brand logos sit comfortably inside with breathing room. This makes the Hualunhongli card look "bigger" / heavier than the rest.

The user selected the outer brand panel (line 57) and the inner white logo tile (line 59) of the Hualunhongli card and wants only this brand's image constrained so it matches the visual footprint of the other logos. No other brand should change.

## Approach

Apply a brand-specific image cap **only when `b.key === 'hualunhongli'`** — keep the shared container sizes identical (so layout stays consistent) and just tighten the image's `max-height` (and add a touch of horizontal inset) so the logo sits inside the white tile with the same visual padding the other logos have.

## Changes

### `src/pages/CuremedHome.tsx` — brand marquee card (around lines 56–72)

In the `BRAND_LIST.map(...)` block where each brand card is rendered, only inside the `l.isImage` branch:

- Detect Hualunhongli: `const isHualun = b.key === "hualunhongli";`
- On the inner `<img>` for the brand logo, append conditional classes when `isHualun`:
  - cap height: `max-h-20` (instead of `max-h-full`)
  - cap width: `max-w-[80%]`
  - keep `object-contain` and `w-auto h-auto`
- Leave the outer `min-h-[140px]` panel and the inner white `min-h-[120px]` tile **unchanged** — this preserves grid alignment with the other 7 cards.
- Do not touch the featured-products marquee further down (different data source).

Result: the Hualunhongli logo renders at the same optical size as the other brand logos inside an identically-sized card.

## Out of scope

- The featured products carousel
- Other brand logos
- Any container/card sizing changes (cards remain the same size; only the image inside Hualunhongli's tile is constrained)
