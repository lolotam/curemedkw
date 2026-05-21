## Goal

Bring the `/admin/overview` look — animated multicolor gradient backdrop, glass cards with gradient-glow hover, gradient page title, fade-in entrance — to every other admin page (Products list, Products editor, Orders, Users, Coupons, Categories, Tags, Landing Pages, AI Models, Reviews, Notifications, Branding, Site Flags, Messages, Subscribers, Logs) and to the dialogs they open.

To stay maintainable (17 pages, each with tables/forms/dialogs), introduce shared shell + card primitives and roll them out, rather than hand-restyling every page from scratch.

## New shared primitives (one new file)

`src/components/admin/AdminPageShell.tsx` — re-implements the visual frame from `AdminOverview.tsx` so every page gets the same chrome:

1. `AdminPageShell` — full-bleed wrapper:
   - Animated gradient backdrop (`from-sky-500/[0.06] via-violet-500/[0.05] to-pink-500/[0.06]` + three `animate-blob-drift` blobs with staggered `animation-delay-*`), absolute `-z-10`.
   - Inner `p-6 md:p-10 max-w-7xl` container (page-specific override possible).
   - Props: `title`, `subtitle?`, `eyebrow?` (defaults to page name), `eyebrowIcon?` (defaults to `Sparkles`), `actions?` (right-aligned slot for "New" buttons, filters), `gradient?` (default `from-sky-500 via-violet-500 to-pink-500` — pages can pick e.g. `from-emerald-400 via-teal-400 to-cyan-500` for Orders).
   - Renders the same eyebrow chip + gradient `bg-clip-text` H1 + muted subtitle, all inside `animate-fade-in`.
2. `AdminGlassCard` — section wrapper matching the "Products by brand" / "Recent messages" cards:
   - `group relative` outer + `absolute -inset-0.5 rounded-3xl bg-gradient-to-br ... opacity-50 blur group-hover:opacity-90` ring, `relative rounded-3xl border border-border/60 bg-card/90 p-7 backdrop-blur-md shadow-xl` body.
   - Props: `gradient?` (defaults to overview blue→violet→pink), `title?`, `action?` (e.g. "View all" link), `className?`, `padded?` (set false for tables that bring their own padding).
3. `AdminStatPill` (optional, exported for reuse) — same `Stat` card used on Overview, so pages like Orders/Subscribers can drop in matching KPI tiles.

These reuse existing tokens and `animate-blob-drift` / `animate-fade-in` already in `src/index.css`, no new CSS needed.

## Rollout across admin pages

For each admin page below, wrap the existing content in `AdminPageShell` (replacing the current page header) and wrap each major section/table/card group in `AdminGlassCard`. Keep all existing functionality, queries, dialogs, forms, columns, and handlers exactly as-is — only the outer chrome changes.

Per-page assignments (gradient picked to match the section's identity, all from the Overview palette):

| Page | Eyebrow | Gradient | Notes |
|---|---|---|---|
| `AdminProducts.tsx` | "Catalog" | sky→violet→pink | Wrap toolbar + table in one `AdminGlassCard` with `padded=false`. Filter chips keep current behavior. |
| `AdminProductEditor.tsx` | "Edit product" (or "New product") | violet→fuchsia→pink | Each tab/section becomes its own `AdminGlassCard`; sticky save bar unchanged. |
| `AdminOrders.tsx` | "Orders" | emerald→teal→cyan | Wrap status filters + table in one card; status badges unchanged. |
| `AdminUsers.tsx` | "Users" | indigo→violet→purple | Single card around table. |
| `AdminCoupons.tsx` | "Coupons" | amber→orange→rose | Card around list + "New coupon" dialog trigger in `actions` slot. |
| `AdminCategories.tsx` | "Categories" | cyan→sky→blue | Tree/list in one card. |
| `AdminTags.tsx` | "Tags" | rose→pink→fuchsia | Single card. |
| `AdminLandingPages.tsx` | "Landing pages" | violet→fuchsia→pink | Card grid of pages stays; outer shell + heading replaced. |
| `AdminLandingPageEditor.tsx` | "Landing editor" | violet→fuchsia→pink | Each panel (slides list, slide style, preview) → `AdminGlassCard`. |
| `AdminModels.tsx` | "AI models" | indigo→violet→purple | Provider sections → cards. |
| `AdminReviews.tsx` | "Reviews" | amber→orange→rose | Table card. |
| `AdminNotificationTemplates.tsx` | "Notifications" | rose→pink→fuchsia | Form panels → cards. |
| `AdminBranding.tsx` | "Branding" | sky→violet→pink | Each upload/setting group → card. |
| `AdminFlags.tsx` | "Site flags" | emerald→teal→cyan | Each flag group → card. |
| `AdminMessages.tsx` | "Messages" | rose→pink→fuchsia | Table card; unread badge keeps existing styling. |
| `AdminSubscribers.tsx` | "Subscribers" | amber→orange→rose | Table card. |
| `AdminLogs.tsx` | "Logs" | indigo→violet→purple | Filters + table in one card. |

`AdminOverview.tsx` itself is refactored to consume `AdminPageShell` + `AdminGlassCard` so all pages stay visually identical to the current overview and stay in sync going forward.

## Dialogs

Add a tiny variant to `src/components/ui/dialog.tsx` via a new exported wrapper (does NOT change shadcn defaults):

- `AdminDialogContent` — re-exports `DialogContent` but with `className` defaulting to: `rounded-3xl border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl` plus a subtle gradient ring (`before:absolute before:-inset-0.5 before:rounded-3xl before:bg-gradient-to-br before:from-sky-400/40 before:via-violet-500/40 before:to-pink-500/40 before:-z-10 before:blur`).

Admin dialogs we touch to swap `DialogContent` → `AdminDialogContent` (no logic changes):
- `src/components/admin/BulkImageUpscaleDialog.tsx`
- `src/components/admin/ImageUpscaleDialog.tsx`
- `src/components/admin/ImagePreviewDialog.tsx`
- `src/components/admin/LongDescriptionRewriteDialog.tsx`
- Coupons, Categories, Tags, Users, Landing pages: their inline `<Dialog>` instances inside the respective admin pages.

## Forms

No structural form changes. Inputs keep their existing shadcn classes. Wrapping the form in `AdminGlassCard` already gives the gradient frame and glass surface the user asked for, without disturbing labels, validation, or layout.

## Out of scope

- No database, route, or behavior changes.
- No new colors or tokens beyond what `AdminOverview` already uses.
- `AdminLogin.tsx` keeps its current standalone branded look.
- No changes to the public site, `AdminLayout` sidebar, or any non-admin file.

## Order of execution

1. Create `AdminPageShell.tsx` + `AdminGlassCard` + `AdminStatPill` exports and `AdminDialogContent`.
2. Refactor `AdminOverview.tsx` to use them (visual parity check).
3. Apply shell + cards to the 17 admin pages in the table above.
4. Swap dialog content wrappers in the listed dialog files.
