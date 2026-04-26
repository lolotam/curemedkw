## Goal

In the **header navigation**, show shorter labels:
- "Australian Bodycare" → **"ABC"**
- "Hartington Pharmaceutical" → **"Hartington"**

Everywhere else (brand cards on the landing page, footer, brand pages, SEO, etc.) the **full names stay unchanged**.

## Approach

Add an optional `shortName` field to the brand metadata, and have the header use `shortName ?? name`. No other component changes are needed.

### 1. `src/lib/brands.ts`
- Add `shortName?: string` to the `BrandMeta` interface.
- Set `shortName: "ABC"` on the `abc` brand.
- Set `shortName: "Hartington"` on the `hartington` brand.
- Leave all other brands untouched (they'll fall back to `name`).

### 2. `src/components/site/SiteHeader.tsx`
- Desktop nav (line ~42): change `label={b.name}` → `label={b.shortName ?? b.name}`.
- Mobile nav (line ~83): same change `label={b.shortName ?? b.name}`.

### Files NOT changed (intentionally — they should keep the full name)
- `src/pages/CuremedHome.tsx` — "Our Brands" cards continue to show full names ("Australian Bodycare", "Hartington Pharmaceutical").
- `src/components/site/SiteFooter.tsx` — footer brand list keeps full names.
- Brand pages, SEO meta, alt text — all unchanged.

## Result

| Location | Australian Bodycare | Hartington |
|---|---|---|
| Header nav (desktop + mobile) | **ABC** | **Hartington** |
| "Our Brands" card on landing | Australian Bodycare | Hartington Pharmaceutical |
| Footer | Australian Bodycare | Hartington Pharmaceutical |
| Brand detail page | Australian Bodycare | Hartington Pharmaceutical |