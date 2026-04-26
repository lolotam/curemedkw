
## Add 3 new brands: Lafe's, Hartington, Phytophar

Goal: register `lafes`, `hartington`, `phytophar` as first-class brands so they get their own `/lafes`, `/hartington`, `/phytophar` landing pages, hero slots in the admin, header menu items, brand cards on `/curemed`, and dedicated color palettes derived from each logo.

---

### 1. Database — extend `brand_key` enum

The `products.brand` column uses a Postgres enum `brand_key` with only `flexitol | kapiva | nada | abc`. Add the 3 new values so you can later create products under them.

Migration:
```sql
ALTER TYPE public.brand_key ADD VALUE IF NOT EXISTS 'lafes';
ALTER TYPE public.brand_key ADD VALUE IF NOT EXISTS 'hartington';
ALTER TYPE public.brand_key ADD VALUE IF NOT EXISTS 'phytophar';
```

`hero_slides.page_key` is a free `text` column with no CHECK constraint — no DB change needed there. Hero slides for new pages just work once added in the admin.

### 2. Copy logos into the project

Copy the uploaded logos from `user-uploads://` to `src/assets/`:
- `ChatGPT_Image_Apr_26_2026_09_29_30_PM.png` → `src/assets/brand-lafes.png`
- `ChatGPT_Image_Apr_26_2026_09_32_35_PM.png` → `src/assets/brand-hartington.png`
- `ChatGPT_Image_Apr_26_2026_09_31_14_PM.png` → `src/assets/brand-phytophar.png`

### 3. Type updates — `src/lib/db.ts`

Extend `BrandKey`:
```ts
export type BrandKey =
  | "flexitol" | "kapiva" | "nada" | "abc"
  | "lafes" | "hartington" | "phytophar";
```

This auto-flows into `Product.brand`, `useProductsByBrand`, the message form, and admin product editor brand pickers.

### 4. Brand registry — `src/lib/brands.ts`

Add 3 new entries to `BRANDS` and append them to `BRAND_LIST` (after `nada`, so the home brand cards order becomes: Flexitol, Kapiva, Australian Bodycare, NADA, Lafe's, Hartington, Phytophar — keeping NADA last among the originals as you previously requested):

```ts
lafes: {
  key: "lafes",
  slug: "lafes",
  name: "Lafe's",
  themeAttr: "lafes",
  logo: lafesLogo,
  tagline: { en: "Clean, natural personal care", ar: "عناية شخصية طبيعية ونقية" },
  about: { en: "Plant-powered deodorants and body care, free from aluminum, parabens, and harsh chemicals.", ar: "..." },
  categories: ["Deodorant", "Body Care"],
  instagram: "https://www.instagram.com/lafeskw",
  seo: { en: "Lafe's Kuwait — Natural aluminum-free deodorants and body care.", ar: "..." },
},
hartington: {
  key: "hartington",
  slug: "hartington",
  name: "Hartington Pharmaceutical",
  themeAttr: "hartington",
  logo: hartingtonLogo,
  tagline: { en: "Trusted pharmaceutical care", ar: "رعاية صيدلانية موثوقة" },
  about: { en: "Pharmaceutical-grade products developed for everyday health needs.", ar: "..." },
  categories: ["Health", "Wellness"],
  instagram: "https://www.instagram.com/hartingtonkw",
  seo: { en: "Hartington Pharmaceutical Kuwait — Trusted pharmaceutical-grade health products.", ar: "..." },
},
phytophar: {
  key: "phytophar",
  slug: "phytophar",
  name: "Phytophar",
  themeAttr: "phytophar",
  logo: phytopharLogo,
  tagline: { en: "Plant-based wellness solutions", ar: "حلول عافية نباتية" },
  about: { en: "Phytotherapy-inspired supplements and wellness products from natural plant sources.", ar: "..." },
  categories: ["Supplements", "Wellness"],
  instagram: "https://www.instagram.com/phytopharkw",
  seo: { en: "Phytophar Kuwait — Plant-based phytotherapy supplements and wellness.", ar: "..." },
},
```

### 5. Routing — `src/App.tsx`

No new routes needed. The existing catch-all `/:brand` → `BrandPage` already handles arbitrary slugs via `slugToBrand(slug)`. Just adding the entries to `BRANDS` makes `/lafes`, `/hartington`, `/phytophar` resolve.

### 6. Header nav — automatic

`SiteHeader.tsx` already maps `BRAND_LIST.map(...)` for both desktop nav and mobile sheet. New brands will appear automatically once added to `BRAND_LIST`. No code change. (If 7 items become too crowded on `lg`, we can later move overflow into a "More brands" dropdown — call it out and you can decide.)

### 7. Hero admin — `src/lib/heroSlides.ts`

Add the 3 new page keys so they show up on the `/admin/landing` index and get their own editor at `/admin/landing/<key>`:
```ts
export type HeroPageKey =
  | "curemed" | "flexitol" | "kapiva" | "nada" | "abc"
  | "lafes" | "hartington" | "phytophar";

export const HERO_PAGES = [
  { key: "curemed", label: "Curemed (Main)", route: "/curemed" },
  { key: "flexitol", label: "Flexitol", route: "/flexitol" },
  { key: "kapiva", label: "Kapiva", route: "/kapiva" },
  { key: "nada", label: "NADA", route: "/nada" },
  { key: "abc", label: "Australian Bodycare", route: "/australian-bodycare" },
  { key: "lafes", label: "Lafe's", route: "/lafes" },
  { key: "hartington", label: "Hartington", route: "/hartington" },
  { key: "phytophar", label: "Phytophar", route: "/phytophar" },
];
```

Then `BrandPage.tsx` already does `<HeroSlider pageKey={brandKey as HeroPageKey} />` so hero slides flow through automatically. Until you upload slides, the `HeroSlider` will render its existing empty/fallback state.

### 8. Brand cards on `/curemed` — automatic

`CuremedHome.tsx` iterates `BRAND_LIST` and uses `b.logo` (with `getBrandLogo` fallback). Since each new brand sets `logo` to the imported asset, the card renders the real logo on a white tile inside the brand-deep panel — no code change required.

### 9. Color palettes — `src/index.css`

Derive each palette from the logo and add CSS variables + `[data-brand]` blocks. `BrandPage` and `SiteLayout` automatically pick these up via `data-brand={meta.themeAttr}`.

**Lafe's** — matte charcoal logo on cream (Modern Organic palette from your reference):
- Primary `#242424` → `0 0% 14%`
- Secondary `#8DA691` (sage) → `132 13% 60%`
- Accent / soft bg `#F9F8F6` (cream) → `40 17% 97%`
- Bg-deep `#D4C5B9` (warm tan) → `28 22% 78%`

**Hartington** — warm brown wordmark + green/blue accent (Hartington Design System palette):
- Primary `#544A45` (warm brown) → `20 9% 30%`
- Secondary `#B1D249` (lime green from arc) → `74 60% 56%`
- Accent `#76B9D0` (sky blue from arc) → `196 49% 64%`
- Soft bg `#F7F8F6` → `90 11% 97%`, bg-deep `30 8% 88%`

**Phytophar** — royal blue wordmark + green/orange/blue capsule:
- Primary `#3F5199` (royal blue) → `228 42% 42%`
- Secondary `#8CBD44` (leaf green) → `82 48% 50%`
- Accent `#F59E2D` (orange capsule) → `33 91% 57%`
- Soft bg `#EAF0FF` → `222 100% 96%`, bg-deep `222 60% 90%`

CSS additions:
```css
/* :root section */
--lafes-primary: 0 0% 14%;
--lafes-secondary: 132 13% 60%;
--lafes-accent: 40 17% 97%;

--hartington-primary: 20 9% 30%;
--hartington-secondary: 74 60% 56%;
--hartington-accent: 196 49% 64%;

--phytophar-primary: 228 42% 42%;
--phytophar-secondary: 82 48% 50%;
--phytophar-accent: 33 91% 57%;

/* [data-brand] blocks */
[data-brand="lafes"] {
  --brand-primary: var(--lafes-primary);
  --brand-secondary: var(--lafes-secondary);
  --brand-bg: var(--lafes-accent);
  --brand-bg-deep: 28 22% 78%;
  --brand-ink: var(--curemed-ink);
}
[data-brand="hartington"] {
  --brand-primary: var(--hartington-primary);
  --brand-secondary: var(--hartington-secondary);
  --brand-bg: 90 11% 97%;
  --brand-bg-deep: 30 8% 88%;
  --brand-ink: var(--curemed-ink);
}
[data-brand="phytophar"] {
  --brand-primary: var(--phytophar-primary);
  --brand-secondary: var(--phytophar-secondary);
  --brand-bg: 222 100% 96%;
  --brand-bg-deep: 222 60% 90%;
  --brand-ink: var(--curemed-ink);
}
```

This automatically themes the brand page hero, filter checkboxes, "Why X" section, contact form button, footer accents, etc. — everything currently using the `bg-brand`, `text-brand`, `bg-brand-soft`, `bg-brand-deep` utilities.

### 10. What you'll do after I ship this

1. Open `/admin/landing` → click each new brand → upload hero slides (images/videos) and CTAs.
2. Open `/admin/products` → create products and pick the new brand from the brand dropdown (it will list the 3 new values automatically once the enum migration runs).
3. (Optional) tell me to refine any of the 3 palettes if the derived colors don't match your taste.

---

### Files touched

- `supabase/migrations/<new>.sql` — extend `brand_key` enum
- `src/assets/brand-lafes.png`, `brand-hartington.png`, `brand-phytophar.png` — copied logos
- `src/lib/db.ts` — extend `BrandKey` type
- `src/lib/brands.ts` — add 3 brand entries + import logos + extend `BRAND_LIST`
- `src/lib/heroSlides.ts` — extend `HeroPageKey` and `HERO_PAGES`
- `src/index.css` — palette variables + `[data-brand]` blocks for the 3 new brands

### Files NOT touched (work automatically)

- `src/App.tsx` — `/:brand` catch-all already routes to `BrandPage`
- `src/components/site/SiteHeader.tsx` — iterates `BRAND_LIST`
- `src/pages/CuremedHome.tsx` — iterates `BRAND_LIST` for brand cards
- `src/pages/BrandPage.tsx` — already passes `brandKey` to `<HeroSlider pageKey>` and `data-brand` to `SiteLayout`
- `src/pages/admin/AdminLandingPages.tsx` + `AdminLandingPageEditor.tsx` — iterate `HERO_PAGES`
