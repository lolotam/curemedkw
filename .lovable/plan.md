## Problem
On `/curemed`, the Lafe's, Hartington, and Phytophar brand cards render auto-generated colored text badges (the blue "LAFE'S / HARTINGTON / PHYTOPHAR" pills in your screenshot) instead of the real logos.

Root cause: `src/lib/placeholder.ts` → `getBrandLogo()` only knows about 4 local PNGs (flexitol, kapiva, nada, abc). The other 3 brands fall through to the SVG text-badge fallback.

All 7 logos are already uploaded to the public `brands-images` bucket and already wired into `src/lib/brands.ts` as `BRANDS[*].logo` (verified: `Australian Bodycare.png`, `flexitol.png`, `Hartington.png`, `kapiva.png`, `Lafes.png`, `NADA.png`, `Phytophar.png`).

## Fix — single file: `src/lib/placeholder.ts`

Rewire `getBrandLogo()` to source logos from the central brand registry instead of the partial local-asset map.

- Remove the 4 local `import … from "@/assets/brand-*.png"` statements.
- Remove the `BRAND_LOGO_IMAGES` map.
- Add `import { BRANDS } from "@/lib/brands"` (use a lazy/runtime lookup to avoid any circular-import concerns — `placeholder.ts` is imported by many files).
- Rewrite `getBrandLogo(brand, name)`:
  1. Find the brand in `BRANDS` whose `themeAttr` matches the `brand` arg (this is what `CuremedHome` passes).
  2. If a `logo` URL exists → return `{ src: brandMeta.logo, isImage: true }`.
  3. Otherwise → fall back to existing `brandLogoSvg(brand, name)` text badge.

Keep `brandLogoSvg`, `placeholderImage`, and `curemedLogoSvg` untouched — still used elsewhere (product placeholders, etc.).

## Result
All 7 brand cards (Flexitol, Kapiva, ABC, NADA, Lafe's, Hartington, Phytophar) on `/curemed` will display the real uploaded logos from the `brands-images` bucket inside the existing white rounded tile, matching the look of the current Flexitol/Kapiva/ABC/NADA cards.

No DB, RLS, header, footer, or brand-page changes required — those already consume `BRANDS[*].logo` directly.

## Out of scope
- Not deleting the now-unused `src/assets/brand-*.png` files (harmless, keeps git history clean).
- No changes to the `BRANDS` registry, card layout, or styling.