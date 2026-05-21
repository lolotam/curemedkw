# Make Admin Pages Full-Width & Responsive

## Problem
After the recent style refactor, every `/admin/*` page wraps its content in `<div className="p-6 md:p-10 max-w-7xl">`. On a 1950px viewport this caps the content at ~1280px, leaving the Products table cramped and clipping the right-most columns (Original price, Stock, Featured, Actions) without a usable horizontal scrollbar.

Root causes:
1. `max-w-7xl` on the page wrapper artificially limits width even when the viewport is much wider.
2. `AdminPageShell` defaults to the same `max-w-7xl`, so any page using it inherits the same cap.
3. `AdminLayout`'s `<main>` is fine, but the inner cap means the table never gets to fill the available space, and there's no outer horizontal scroll because the page content fits within the 1280px box.

## Fix

### 1. `src/components/admin/AdminPageShell.tsx`
- Change default `maxWidthClass` from `"max-w-7xl"` to `"max-w-none w-full"` so admin pages span the full available area inside `<main>`. Keep the prop overridable for any page that wants a narrower reading column later.

### 2. Update each admin page wrapper
Replace `<div className="p-6 md:p-10 max-w-7xl">` with `<div className="p-6 md:p-10 w-full max-w-none">` in:
- `src/pages/admin/AdminProducts.tsx` (the page from the screenshot)
- `AdminOrders.tsx`, `AdminUsers.tsx`, `AdminCoupons.tsx`, `AdminCategories.tsx`, `AdminTags.tsx`, `AdminReviews.tsx`, `AdminModels.tsx`, `AdminNotificationTemplates.tsx`, `AdminLandingPages.tsx`, `AdminLandingPageEditor.tsx`, `AdminBranding.tsx`, `AdminFlags.tsx`, `AdminMessages.tsx`, `AdminSubscribers.tsx`, `AdminLogs.tsx`, `AdminProductEditor.tsx`, `AdminOverview.tsx`

This lets the Products table breathe and reveals all columns at ≥1500px viewports.

### 3. Guarantee horizontal scroll on the Products table (and any wide table) for smaller widths
In `AdminProducts.tsx` the table is already wrapped with `<div className="overflow-x-auto">`, but the inner `<table className="w-full text-sm">` collapses to the parent width and squashes cells instead of scrolling. Two small tweaks:
- Add `min-w-[1100px]` to the `<table>` so it keeps a comfortable column layout and the wrapper actually scrolls horizontally when the viewport is narrower than that.
- Add `whitespace-nowrap` to numeric / status columns (price, original price, stock, featured, actions header) so they don't wrap into multiple lines on mid-size screens.

### 4. AdminLayout `<main>` overflow
Keep `flex-1 min-w-0` but change `overflow-hidden` → `overflow-x-hidden` so vertical scrolling is unaffected and any inner `overflow-x-auto` container can still scroll its own content. The animated backdrop already uses `absolute inset-0` so it stays contained.

## Out of scope
- No changes to data, queries, filters, or table logic.
- No restyle of the glass cards, gradients, or header chrome.
- No changes to public site, auth, or non-admin pages.
- Dialogs are not touched in this pass.
