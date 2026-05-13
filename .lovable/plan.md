## Fix Lighthouse mobile "image elements do not have explicit width and height" finding

Lighthouse flags `<img>` elements that ship without explicit `width`/`height` attributes — the browser can't reserve space, causing **CLS (Cumulative Layout Shift)** on mobile. Every image in the app currently relies only on CSS sizing (`h-full w-full`, `h-12 w-auto`, etc.), so all of them get flagged.

The fix is to add explicit `width` and `height` attributes that match the **intrinsic aspect ratio** of each image. The CSS already controls displayed size; the attributes only tell the browser the ratio so it can reserve the box before the image loads.

### Files to update (frontend only)

User-visible `<img>` tags that need explicit `width`/`height`:

| File | Image | Aspect |
|---|---|---|
| `src/components/site/ProductCard.tsx` | product thumb (square container) | 800×800 |
| `src/components/site/SubcategoryCarousel.tsx` | subcategory tile (square) | 800×800 |
| `src/components/site/SlidePreview.tsx` | hero slide (full-bleed) | 1920×800 |
| `src/components/site/SiteHeader.tsx` | brand logo | 240×96 (h-20 ≈ 80px, ~3:1 logo box) |
| `src/components/site/SiteFooter.tsx` | brand logo | 240×96 |
| `src/pages/CuremedHome.tsx` | brand tile (`useImageTile`) | 200×120 |
| `src/pages/CuremedHome.tsx` | brand inline logo | 160×48 |
| `src/pages/CuremedHome.tsx` | featured product card image | 800×800 |
| `src/pages/CategoryPage.tsx` | category banner | 1900×600 (matches `aspect-[19/6]`) |
| `src/pages/ProductDetail.tsx` | main product image + thumbs | 800×800 each |
| `src/pages/Cart.tsx` | cart line item | 200×200 |
| `src/pages/Checkout.tsx` | order summary thumb | 112×112 |
| `src/pages/OrderConfirmation.tsx` | order line item | 96×96 |
| `src/pages/Account.tsx` | avatar | 128×128 |

Skip: `src/pages/Index.tsx` (placeholder), all `src/pages/admin/*` (not user-facing, not Lighthouse-scored), `src/components/admin/ImageUpscaleDialog.tsx`, `src/components/site/LiveOrdersToast.tsx` (toast, transient).

### Approach

For each `<img>`:
1. Add `width={N}` and `height={N}` attributes matching the aspect ratio used by the surrounding container.
2. Leave the existing Tailwind classes alone — `object-cover` / `object-contain` continue to govern display.
3. Where the image is purely decorative (e.g. checkout/order list thumbnails with `alt=""`), keep `alt=""` but still add dimensions.

No changes to backend, sitemap, robots, or `index.html`.

### Verification

After edits, mark the SEO finding fixed via `seo_chat--update_findings` so the next Lighthouse rescan re-evaluates. (Cannot run Lighthouse from the sandbox; the user republishes and re-runs the scan from the SEO tab.)

### Note on Google Search Console

Already verified — `sc-domain:curemedkw.com` shows `permissionLevel: siteOwner` for your connected account. No OAuth or verification work needed; nothing to change in the project for that.