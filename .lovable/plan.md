## Goal
Make the storefront feel native on mobile (320–480 px), comfortable on tablet (768 px), and unchanged on desktop. No business-logic or data changes — purely layout, spacing, typography, tap targets, overflow, and a few mobile-only UI affordances.

## Audit findings (what's wrong today on mobile)

### Global / chrome
- `SiteHeader` container is `h-24` (96 px) with a 240×96 logo — eats too much viewport on phones; logo never shrinks.
- Mobile menu (`Sheet`/dropdown panel) is missing Sign in, Account, language, theme — those controls sit in a cramped icon strip next to the menu button.
- Header icons row (`UserNotificationBell`, `CartIcon`, `UserMenu`, lang, theme, hamburger) overflows on small phones because nothing collapses under `sm`.
- Heavy section vertical rhythm (`py-16 md:py-24`) is the same on mobile, making pages feel very tall.
- No global `overflow-x` guard — some carousels / wide grids occasionally cause horizontal scroll.

### Home (`CuremedHome.tsx`)
- Hero slider has zero‑slide states that render a tall empty band on phones (visible in the screenshot).
- "Our brands" carousel cards overflow text on small widths ("intense moisturization for very dry skin" bleeds).
- "What we do" 4-col grid collapses fine but cards have desktop padding on phones.

### Brand page (`BrandPage.tsx`)
- Filter aside is rendered only inside `lg:grid-cols-[240px_1fr]` — on mobile there is **no way to filter by category or discount**. Desktop-only.
- "Why this brand" 4-card grid uses `sm:grid-cols-2` only — looks cramped on 360 px.
- Big `text-3xl md:text-4xl` headings + `py-16 md:py-24` make sections feel oversized on phones.

### Category page (`CategoryPage.tsx`)
- Banner is correctly hidden on mobile (good), but the toolbar (`Search`, `Select w-44`, brand chip row) wraps awkwardly — search input has `min-w-[200px]` while the Select is 176 px next to it; on 360 px they overflow the row.
- Brand chip row works on mobile, but the rest of the "Filter" sidebar isn't reachable from mobile (no drawer).
- Hard-coded English strings ("Filter", "Brands", "Search products…", "Sort by", sort options) — should pass through i18n.

### Product detail (`ProductDetail.tsx`)
- Gallery uses `grid lg:grid-cols-2 gap-16` — fine — but thumbnail strip is `grid-cols-4` always; with 8+ images thumbs become tiny on phones. Should scroll horizontally on small screens.
- Price line with discount wraps badly: `text-4xl` price + line-through `text-xl` + `-XX% OFF` badge can blow past viewport on 360 px.
- Stock badge sits in the same flex row as the price → wraps onto a third line on phones.
- Two stat tiles (size / SKU) `grid-cols-2` is OK; but `Inquire` button at the bottom is full text + lg size and stacks awkwardly under the long description.
- No sticky "Add to cart" bar on mobile — users scroll a long page and lose the CTA.
- Breadcrumb row has `Edit` admin button that pushes the breadcrumb text on narrow widths.

### Cart (`Cart.tsx`) & Checkout (`Checkout.tsx`)
- Both pages use multi-column layouts (cart line items + summary side panel; checkout form + summary). They need to stack on mobile with the summary collapsed/sticky.
- Qty controls (Plus / Minus / Trash) and item thumbnails need a tighter mobile row.
- Checkout form is a long single column — fine — but country/governorate/area selects and address row are likely 2-col on `md` and need to remain single-col under `sm`.
- Order summary should become a collapsible "Order summary (KD X.XX)" panel above the form on mobile, or stick to the bottom of the viewport.

### ProductCard (`ProductCard.tsx`)
- `p-4` padding + 2-line title + 2-line short desc + price row + cart icon = too tall on phones in a 2-col grid.
- Price row with discount (`was` label + strike + price + cart icon) wraps to 2 lines on narrow cards.
- Featured + discount badges can overlap on tiny cards.

### Footer (`SiteFooter.tsx`)
- 4-column layout collapses to single column on mobile but spacing is desktop-sized.

## Implementation plan

### 1. Global primitives
- **Tailwind `container`**: tighten mobile padding (e.g. `px-4 sm:px-6 lg:px-8`) so content breathes without horizontal scroll.
- **Section rhythm helper**: replace ad-hoc `py-16 md:py-24` with a consistent pair like `py-10 md:py-20`. Apply on Home, Brand, Category, ContactSection, Newsletter, Why-brand, Related products.
- **Global overflow guard** in `index.css`: `html, body { overflow-x: hidden; }` (already may be set; verify).
- **Tap target minimum**: ensure icon-only buttons render at `h-10 w-10` (40 px) on mobile.

### 2. `SiteHeader.tsx`
- Header height: `h-16 md:h-20 xl:h-24`. Logo: `h-10 md:h-16 xl:h-20 w-auto`.
- Move language toggle + theme toggle into the mobile `Sheet` menu (keep only Cart + Hamburger + User icon visible in the mobile bar).
- Add Sign-in / Account / My orders / Admin links to the mobile menu, plus Language + Theme rows at the bottom.
- Reduce icon row gap on mobile (`gap-0` until `sm`).
- Make hamburger open a proper `Sheet` from the right (already used for AdminBell pattern) instead of an inline panel for nicer mobile UX.

### 3. `BrandPage.tsx`
- Introduce a mobile filter trigger: a `Filter` button in a sticky toolbar under the page title that opens a `Sheet` (right side) containing the existing category + discount filter UI. Reuse the exact same components — no logic duplication.
- Replace `grid lg:grid-cols-[240px_1fr]` so the sidebar is only mounted from `lg` up; under `lg` the same filters live inside the sheet.
- Why-brand grid: `grid-cols-2 sm:grid-cols-2 lg:grid-cols-4` and reduce card padding on mobile.
- Section padding: `py-10 md:py-20`. Heading: `text-2xl sm:text-3xl md:text-4xl`.

### 4. `CategoryPage.tsx`
- Same mobile `Filter` sheet pattern: brand filters + (future) more filters in a drawer; remove the `lg:hidden` inline chip row that competes with toolbar wrap.
- Toolbar redesign on mobile:
  - Row 1: full-width search.
  - Row 2: sort `Select` (50%) + Filter button (50%).
  - From `md` up, restore today's single-row layout.
- Replace hard-coded English strings with i18n keys (add fallbacks in `lib/i18n` if missing).

### 5. `ProductDetail.tsx`
- Main grid: keep `lg:grid-cols-2`; reduce gaps on mobile (`gap-6 lg:gap-16`) and section padding to `py-6 md:py-16`.
- Thumbnails: switch to a horizontal `overflow-x-auto` strip with `snap-x` under `sm`, `grid-cols-4` from `sm`.
- Price block: stack price + discount badge first, move stock badge to its own line, smaller price on phones (`text-3xl sm:text-4xl`).
- Move admin Edit button into a small icon-only chip that floats on the right (smaller text "Edit" hidden under `sm`).
- Add a sticky mobile CTA bar at the bottom (`fixed bottom-0 lg:hidden`) with price + Add to cart, mirroring app patterns. Hide when out of stock or price hidden (show "Contact for price" CTA instead).
- Benefits / ingredients / usage / description headings tighten on mobile.

### 6. `ProductCard.tsx`
- Reduce padding on phones (`p-3 sm:p-4`).
- Cap title to 2 lines, hide short description in compact + small-screen contexts (`hidden sm:block`).
- Price row: when discount is present on phones, hide the small `was` label; stack strike + price tightly; cart icon stays right-aligned.
- Make badges (`featured`, `-X%`) `text-[10px]` and reduce padding.

### 7. `Cart.tsx`
- Single-column on mobile, summary collapses to a sticky bottom bar with total + Checkout button (`fixed bottom-0 lg:static`).
- Cart line items: avatar 64 px, name 1-line truncate + brand/category small, qty controls compact (`h-9 w-9`).

### 8. `Checkout.tsx`
- Stack form + summary on mobile (`grid lg:grid-cols-[1fr_360px]`).
- Summary becomes a collapsible card above the form (`<details>` or a custom toggle) showing total when collapsed.
- Address fields: all single-column under `sm`, two-column from `sm` for short fields (block/street/building) where it reads well.
- Pay method tiles: stack on mobile, 3-up on `sm`.

### 9. `SiteFooter.tsx`
- Single-column on mobile with section headings becoming larger; tighter padding (`py-10 md:py-16`).

### 10. RTL pass
- Verify breadcrumbs, sticky CTAs, sheet side, and back arrows all flip with `rtl:` modifiers (most already do).

## Out of scope
- No content/data changes, no new business logic, no new pages.
- Admin pages are excluded (the request lists only public pages).
- No SQL / database migrations needed.

## Verification
After implementation, walk through each page at 360 px, 414 px, 768 px, and 1280 px:
- No horizontal scroll.
- All primary CTAs (Add to cart, Checkout, Sign in, Filter) reachable without zooming.
- Headings, prices, badges never clip or wrap mid-symbol.
- Tap targets ≥ 40 px.
- RTL renders correctly on the Arabic locale.
