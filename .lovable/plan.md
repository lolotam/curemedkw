## Goal

Add **Hualunhongli** as a new partner brand so it appears in:
- The header **Partners** dropdown and mobile nav (link to `/hualunhongli`).
- The brand page route `/hualunhongli` (auto-wired by the existing `/:brand` route).
- `/admin/branding` as a new "Hualunhongli logo" field with **URL + Upload** (same pattern as the other 7 brands).
- The `products` table so admins can create products under this brand.

Also: extract the brand color palette from the reference site and the uploaded logo, and apply it as the `[data-brand="hualunhongli"]` theme.

---

## Color palette (extracted)

From the uploaded logo (red 3D glossy text on dark) and the source site `wounds-dressing.com` (dark hero, red accents, teal CTA):

| Token | Hex | Use |
|---|---|---|
| Brand primary (red) | `#E11B22` | Buttons, links, brand highlights |
| Brand deep red | `#A8121A` | Hover / pressed |
| Brand dark surface | `#1A1A1C` | Hero bg / dark sections |
| Brand soft tint | `#FDECEC` | Light brand-soft backgrounds |
| Accent teal (CTA) | `#1FB8B0` | Secondary CTA (matches site "Quote" button) |
| Foreground on red | `#FFFFFF` | Text on primary |

These map onto the existing `--brand`, `--brand-foreground`, `--brand-soft` CSS vars under a new `[data-brand="hualunhongli"]` block in `src/index.css`, mirroring how the other brands are themed.

---

## Database migration

Add `hualunhongli` to the `brand_key` Postgres enum so products can reference it:

```sql
ALTER TYPE public.brand_key ADD VALUE IF NOT EXISTS 'hualunhongli';
```

No new table, no RLS changes — `products`, `site_settings`, and the `brands-images` storage bucket already support per-brand records keyed by `brand_key`. After the migration, `src/integrations/supabase/types.ts` regenerates automatically and includes `"hualunhongli"` in the enum.

---

## Code changes

### 1. `src/lib/db.ts`
Extend the `BrandKey` union:
```ts
export type BrandKey =
  | "flexitol" | "kapiva" | "nada" | "abc"
  | "lafes" | "hartington" | "phytophar"
  | "hualunhongli";
```

### 2. `src/lib/brands.ts`
- Add `hualunhongliLogo` constant pointing to the uploaded logo (we'll copy `user-uploads://Hualunhongli.png` → `brands-images` bucket path `Hualunhongli.png` so it lives alongside the other brand logos and is editable from `/admin/branding`).
- Add a `BRANDS.hualunhongli` entry:
  - `slug: "hualunhongli"`, `name: "Hualunhongli"`, `themeAttr: "hualunhongli"`.
  - Tagline EN: "Self-heating relief, trusted wound care" / AR equivalent.
  - About EN: "Specialists in self-heating FIR therapy patches, wound dressings and pain-relief plasters — clinically designed for lasting comfort." / AR equivalent.
  - `categories: ["Heat Therapy Patches","Joint Pain Patches","Menstrual Pain Patches","Back Pain Patches","Wound Dressing"]` (taken from the source site sidebar).
  - `instagram: ""` (placeholder), `seo` filled in EN/AR.
- Append `BRANDS.hualunhongli` to `BRAND_LIST` so the header dropdown and mobile nav pick it up automatically.

### 3. `src/pages/admin/AdminBranding.tsx`
No code change needed — the page already iterates `BRAND_LIST` and renders a `BrandingField` (URL + Upload + preview + transparency check) for each brand. Adding the brand to `BRAND_LIST` automatically gives it a "Hualunhongli logo" admin row writing to `branding_brand_logo_hualunhongli` in `site_settings` and uploading to `brands-images/branding/brand-hualunhongli-*.png`.

### 4. `src/index.css`
Add a brand theme block (light + dark) using the palette above:
```css
[data-brand="hualunhongli"] {
  --brand: 358 79% 49%;          /* #E11B22 */
  --brand-foreground: 0 0% 100%;
  --brand-soft: 357 80% 96%;     /* #FDECEC */
  --accent: 175 71% 42%;          /* #1FB8B0 */
}
[data-brand="hualunhongli"].dark,
.dark [data-brand="hualunhongli"] {
  --brand: 358 80% 56%;
  --brand-soft: 358 30% 14%;
  --background: 240 4% 11%;       /* #1A1A1C */
}
```

### 5. Asset upload
Copy the uploaded logo into the project + the public `brands-images` bucket so it survives as the default Hualunhongli logo:
- `code--copy user-uploads://Hualunhongli.png` → upload to bucket `brands-images` at key `Hualunhongli.png` (public URL becomes the brand's default `logo`).

Admin can later override via `/admin/branding → Hualunhongli logo → Upload`.

---

## What the user gets

- **Header → Partners** dropdown gains "Hualunhongli". Clicking it opens `/hualunhongli` rendered by the existing `BrandPage` (hero slider, products grid filtered by `brand = 'hualunhongli'`, why-us, testimonials, FAQ, contact).
- **Mobile menu** lists Hualunhongli under Partners.
- **`/admin/branding`** shows a new "Hualunhongli logo" card with URL field + Upload button + preview, identical UX to the other brand rows.
- **`/admin/products` → New product** can pick `Hualunhongli` from the brand dropdown (it reads from the same enum).
- The `/hualunhongli` page is themed in the extracted red/dark palette.

---

## Acceptance checks

- DB: `select unnest(enum_range(null::brand_key));` includes `hualunhongli`.
- UI: header Partners dropdown shows 8 brands ending with Hualunhongli; clicking goes to `/hualunhongli` and renders without errors.
- Branding admin: Hualunhongli logo row appears, paste-URL save works, file upload writes to `brands-images/branding/brand-hualunhongli-*.png` and updates the header logo on `/hualunhongli`.
- Products admin: brand dropdown lists Hualunhongli; saving a product with brand `hualunhongli` succeeds and the product appears on `/hualunhongli`.
- Visual: `/hualunhongli` uses red `#E11B22` for primary buttons and brand accents.