# Big Feature Pass — 9 Items

This plan tackles every item in your message. Items are independent so each can be tested in isolation. Database changes are grouped into ONE migration at the start.

---

## 0. Database migration (single migration, runs first)

**Table changes:**

- `categories`: add `parent_id uuid` (self-referencing, nullable) + `visible_pages text[] default '{}'` (which page carousels show this category — values from `'curemed' | 'flexitol' | 'kapiva' | 'nada' | 'abc'`).
- `products`: add `original_price numeric` (the "was" price, nullable). Existing `price` column becomes the **discounted / current price** (no rename — would break code; only the UI label changes to "Discounted price").
- `products`: add `source_url text default ''` (the scraped product URL).
- New table `tags` → `id uuid pk`, `name text unique not null`, `slug text unique`, `created_at timestamptz default now()`. RLS: anyone can read, only admins can insert/update/delete.
- New table `testimonials` → `id, name_ar, name_en, role_ar, role_en, quote_ar, quote_en, gender ('m'|'f'), location text, sort_order int, is_active bool, created_at`. RLS: public read active, admin all.

**Seed data inserted in the same migration:**

- Backfill `visible_pages` to `{'curemed'}` for the 6 existing categories so the main page carousel keeps working.
- Insert **30 testimonials** — Kuwaiti first names (men: Abdullah, Yousef, Bader, Faisal, Mohammad, Khalid, Ahmad, Saud, Nasser, Hamad, Salem, Talal, Meshal, Fahad, Jassem; women: Noura, Sara, Maryam, Latifa, Dalal, Shaikha, Hessa, Fatima, Reem, Aisha, Bibi, Mona, Ghadeer, Munira, Rania), bilingual quotes written in **Kuwaiti dialect** (e.g. "والله المنتج عجيب، استخدمته أسبوع وحسيت بالفرق صراحة" / "Honestly the product is amazing, used it for a week and felt the difference"), Kuwait locations (السالمية، حولي، الجهراء، الفروانية، الأحمدي، مبارك الكبير، العاصمة).

---

## 1. Subcategories (admin + storefront)

**`src/pages/admin/AdminCategories.tsx`** — `CategoryEditorDialog`:

- Add a "Parent category" select (defaults to "— None (top-level) —", lists existing top-level categories).
- Add a **"Show carousel on these pages"** block with **5 checkboxes**: Curemed (Main), Flexitol, Kapiva, NADA, Australian Bodycare. Mapped to the `visible_pages` array.
- Categories table gets a small "Sub of: …" pill under English name and a `Parent` column.

**`src/lib/db.ts`** — extend `Category` type with `parentId: string | null` and `visiblePages: string[]`; update the row mapper + `categoryToRow`.

**`src/components/site/CategoryCarousel.tsx`** — accept a new `pageKey` prop (defaults to `"curemed"`). Filter categories where `visiblePages.includes(pageKey)`. Group by parent → render only top-level cards in the marquee; sub-categories appear on the category landing page.

Pages that mount the carousel (`CuremedHome`, `BrandPage`) pass their `pageKey` so each page only shows the categories that were ticked for it.

**`src/pages/CategoryPage.tsx`** — when the category has children, render a "Subcategories" row above the product grid.

---

## 2. Original price / Discounted price + WAS · NOW badge

**`AdminProductEditor.tsx`**

- New "Original price (KD)" input next to the existing price.
- Rename the existing "Price (KD)" label to **"Discounted price (KD)"**.
- Logic: discount applies only when `originalPrice > price > 0`.

**`ProductCard.tsx`** + **`ProductDetail.tsx`**

- When discounted: show two-line price → small struck-through "WAS KD x.xx" above bold "NOW KD y.yy" + a red "−NN%" badge in the top-right of the image.
- A new "Discounted" filter chip on `BrandPage` and a homepage **"Special offers"** section listing all discounted products (uses a new `useDiscountedProducts()` hook).

**`src/lib/db.ts`** — add `originalPrice: number | null` to the `Product` type and mapper.

---

## 3. Tags admin section

New page **`src/pages/admin/AdminTags.tsx`** + route `/admin/tags`, sidebar entry under Categories (icon: `Tag`).

- Lists all rows from `tags` table with usage count (`count(*) from products where :tag = any(tags)`).
- Inline edit (rename), delete (with confirm), add new.
- Filter: when admin clicks a tag chip, links to `/admin/products?tag=<slug>` and `AdminProducts.tsx` adds a `tag` URL filter that filters on `p.tags.includes(tag)`.

`src/lib/db.ts` — new `useTags`, `useUpsertTag`, `useDeleteTag`, `useRenameTag` (the rename also runs an UPDATE on `products` to replace the old string in every `tags` array).

---

## 4. Scraped link column + product page link in admin table

**`AdminProductEditor.tsx`** — store `scraped.sourceUrl` into a new `sourceUrl` field on the form when the importer succeeds (passed through `applyImported`). Save it to the new `source_url` DB column.

**`AdminProducts.tsx`** — add two new compact icon columns:

- **Source** → `<a target="_blank" href={p.sourceUrl}>` with `ExternalLink` icon (disabled/grey if empty).
- **View** → links to `/{brandSlug}/product/{p.id}` (the public product page on the same site).

---

## 5. AI description rewriter (with 10 templates, supports HTML)

**New file `src/lib/aiDescription.ts`** — exports `DESCRIPTION_TEMPLATES` array of 10 prompt templates:

1. Concise medical/clinical (plain text)
2. Friendly conversational (plain text)
3. Bullet-point benefits (HTML `<ul>`)
4. Two-paragraph editorial (HTML `<p>`)
5. SEO-rich long form (HTML with `<h3>` + `<p>`)
6. Comparison "Why choose this" (HTML table)
7. Step-by-step routine (HTML ordered list)
8. Dermatologist tone (plain text)
9. Mobile-first short blurb (plain text, ≤ 60 words)
10. Bilingual EN/AR side-by-side (HTML two-column)

Plus `rewriteDescription({ current, name, ingredients, benefits, templateId, format }) → string` — calls a new edge function `rewrite-description` that uses Lovable AI (`google/gemini-3-flash-preview` via `LOVABLE_API_KEY`). The function returns either plain text or HTML depending on the chosen template.

**New edge function `supabase/functions/rewrite-description/index.ts`** — auth via JWT, validates input with zod, calls the Lovable AI gateway, returns `{ text }`.

**`AdminProductEditor.tsx`** — above the "Long description" textarea, add a `Sparkles` "AI rewrite" button → opens a `Popover` with the 10 templates as a list and a "Generate" button. Result replaces the textarea content (with one-click undo). Long description gets a tiny tab toggle "Plain / HTML" — when HTML, render a small live preview underneath using `dangerouslySetInnerHTML` (we trust admin-authored content).

`ProductDetail.tsx` — render `longDescription` via `dangerouslySetInnerHTML` if it contains HTML tags, else as plain text.

---

## 6. Testimonials section — 30 Kuwaiti voices

**`src/components/site/Testimonials.tsx`** — drop hard-coded `DEFAULTS`. Fetch from new `useTestimonials()` query (Supabase `testimonials` table where `is_active = true`).

Display refresh:

- 3-column grid on desktop, single column on mobile
- Avatar circle with initial (color tinted by gender for visual variety)
- Show `location` (e.g. "السالمية") under the name
- Wraps in an embla `Carousel` if more than 6 items so all 30 can rotate

The 30 seeded rows come from migration step 0 above.

---

## 7. Fake live-order ticker (every 2 minutes)

**New file `src/components/site/LiveOrdersToast.tsx`** — mounted once inside `SiteLayout`.

Behavior:

- On mount, waits 8 s before first toast (so the page doesn't open with one immediately).
- Every **120 s** picks a random product from `useProducts()` + a random Kuwaiti name (reuses the testimonial name pool from `src/lib/kuwaitData.ts`, a small new file) + random Kuwait area, fires a `sonner` toast positioned **bottom-left**:

  > 🛒 **عبدالله من السالمية** طلب **Flexitol Heel Balm** قبل لحظات
  > _(EN: "Abdullah from Salmiya just ordered Flexitol Heel Balm")_

- Auto-dismisses after 6 s. Pauses while the tab is hidden (`document.visibilityState`).
- A small live-pulse counter chip is added to **`SiteHeader`**: green dot + "X people viewing now" (random 8–34, refreshes every 30 s) — gives the "live activity" header indicator you described.

No DB writes — purely cosmetic / social-proof.

---

## 8. Confirm Contact ↔ Admin Messages integration

**Verified during planning** (`ContactSection.tsx` already uses `useCreateMessage()` → inserts into `public.messages`; `AdminMessages.tsx` reads via `useMessages()`). **No code change needed** — only a small note added to `AdminMessages.tsx` page header: "Messages submitted via the public Contact form appear here in real time." and we'll enable `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;` so the admin list updates instantly without refresh, and the unread badge in the sidebar bumps live.

---

## 9. 3D WhatsApp floating button

**New component `src/components/site/WhatsAppFab.tsx`** — fixed bottom-right (bottom-left in RTL), `z-50`, sits above the live-order toast.

- 64×64 round button, brand WhatsApp green `#25D366`
- Pure-CSS 3D effect: layered radial gradient + inner shadow + soft drop shadow + subtle `animate-bounce`-style float, plus a hover tilt (`hover:rotate-[-6deg] hover:scale-110 transition-transform`)
- Pulsing ring (`absolute inset-0 rounded-full animate-ping bg-[#25D366]/30`)
- Click → `https://wa.me/96560003759?text=` + URL-encoded "Hello, I'm interested in your products" (bilingual based on current `lang`)
- Mounted globally in `SiteLayout` so it appears on every public page.

---

## Files

### New
- `src/pages/admin/AdminTags.tsx`
- `src/components/site/LiveOrdersToast.tsx`
- `src/components/site/WhatsAppFab.tsx`
- `src/lib/aiDescription.ts`
- `src/lib/kuwaitData.ts` (name + area pools)
- `supabase/functions/rewrite-description/index.ts`

### Edited
- `src/lib/db.ts` (Product/Category types, new hooks for tags + testimonials + discounted)
- `src/lib/heroSlides.ts` (no change, just referenced)
- `src/lib/i18n.tsx` (new strings: `nav.tags`, `discount.was`, `discount.now`, `category.subcategories`, `liveOrder.template`, etc.)
- `src/pages/admin/AdminCategories.tsx` (parent + page-checkboxes)
- `src/pages/admin/AdminProductEditor.tsx` (original price, AI rewrite popover, source URL passthrough)
- `src/pages/admin/AdminProducts.tsx` (source link + view link columns, tag URL filter)
- `src/pages/admin/AdminMessages.tsx` (note + realtime subscription)
- `src/components/admin/AdminLayout.tsx` (new "Tags" sidebar entry)
- `src/components/admin/ProductImportFromUrl.tsx` (pass `sourceUrl` through `onImported`)
- `src/components/site/ProductCard.tsx` (WAS/NOW + discount badge)
- `src/components/site/CategoryCarousel.tsx` (`pageKey` prop, `visible_pages` filter)
- `src/components/site/Testimonials.tsx` (DB-driven, 30-item carousel)
- `src/components/site/SiteLayout.tsx` (mount `LiveOrdersToast` + `WhatsAppFab`)
- `src/components/site/SiteHeader.tsx` (live-pulse "X viewing now" chip)
- `src/pages/CuremedHome.tsx` + `src/pages/BrandPage.tsx` (pass `pageKey` to `CategoryCarousel`, add "Special offers" section on home)
- `src/pages/CategoryPage.tsx` (subcategory row)
- `src/pages/ProductDetail.tsx` (HTML-aware long description, WAS/NOW pricing)
- `src/App.tsx` (route `/admin/tags`)

### Untouched / no-op
- Existing `messages` flow (already integrated — only realtime publication added).

---

## Result

- Categories are tree-structured AND can be toggled per page carousel.
- Products carry both an original and a discounted price; cards show WAS/NOW + discount %.
- A standalone Tags admin section lets you rename/delete tags and jump to filtered product lists.
- Admin product table exposes both the scraped source URL and the public product page URL.
- The long-description editor gets a 10-template AI rewriter that can output HTML.
- Testimonials section renders 30 authentic-sounding Kuwaiti voices in a rotating carousel.
- A subtle live-order toast pops every 2 minutes plus a "viewing now" chip in the header.
- Contact form → admin Messages link is confirmed and upgraded to realtime.
- A polished 3D WhatsApp floating button on every page links straight to **+965 6000 3759**.