
# Unified Hero Slide Editor with Page Dropdown

Right now `/admin/landing` shows one card per landing page (Curemed, Flexitol, Kapiva…), and clicking a card opens `/admin/landing/:pageKey` to edit that page's slides. You want a single editor screen with a **dropdown of all pages at the top**, so you can pick a brand and start adding/editing slides without leaving the page.

## 1. Make `pageKey` optional in the route

In `src/App.tsx` (or wherever admin routes live — I'll confirm during implementation), keep `/admin/landing/:pageKey` working **and** make `/admin/landing` itself render the editor with the dropdown.

- `/admin/landing` → editor with no page selected (dropdown shows "Choose a landing page…")
- `/admin/landing/:pageKey` → editor with that page preselected (deep-link / shareable)
- Selecting a different page from the dropdown updates the URL via `navigate(`/admin/landing/${key}`)` — keeps back/forward working

This means the existing `AdminLandingPages.tsx` index page (the brand cards grid) becomes redundant for navigation. I'll **keep it as an optional "browse all" view** moved to `/admin/landing/all` so nothing is lost, but the **default** `/admin/landing` becomes the new unified editor.

## 2. New top bar in `AdminLandingPageEditor.tsx`

Replace the current header with a sticky toolbar containing:

- **Page selector** — shadcn `Select` listing all `HERO_PAGES`. Each item shows the brand logo (from `BRANDS[key].logo` when available, "C" monogram for Curemed) + the label + a small route chip (`/flexitol`, etc.), so it's visually obvious which brand you're editing.
- **Slide count badge** — e.g. "4 slides · 3 active" for the current page.
- **"Add slide" button** — disabled until a page is picked.
- **"View live" link** — opens `meta.route` in a new tab.
- **Back link** — to `/admin/landing/all` (the grid view) for users who prefer browsing.

The toolbar uses `sticky top-0 z-20 bg-background/80 backdrop-blur border-b` so it stays visible while scrolling through long slide lists.

## 3. Empty / unselected state

When no `pageKey` is in the URL:
- Hide the slides list.
- Show a centered prompt: an icon + "Select a landing page above to start editing its hero slides", plus a compact horizontal scroll of brand chips as quick-pick shortcuts (each chip = brand logo + name, click to select).

## 4. Loading & switching behavior

- When `pageKey` changes (via dropdown or URL), clear the local `slides` state, show the existing loader, then call `listSlidesForPage(newKey, false)`.
- Unsaved-changes guard: if any slide has `_dirty === true`, confirm before switching pages (`"You have unsaved changes on this page. Discard them?"`). Cancel = revert dropdown to current page.

## 5. Layout polish

- Widen container from `max-w-5xl` to `max-w-6xl` to give the dropdown + slide cards more breathing room.
- The page title becomes dynamic: `"Hero slides — {selected brand label}"` with the brand logo inline next to it (matches the brand styling already used on the index cards).

## 6. Files to edit

- `src/pages/admin/AdminLandingPageEditor.tsx` — add page dropdown, sticky header, empty state, page-switch handling, dirty-check, dynamic title.
- `src/App.tsx` (or admin route file) — add `/admin/landing` → `AdminLandingPageEditor` (no param), keep `/admin/landing/:pageKey`, move existing index to `/admin/landing/all`.
- `src/pages/admin/AdminLandingPages.tsx` — add a small banner at the top linking back to the new editor view ("Tip: use the unified editor"). No structural change.
- (Optional) `src/components/admin/AdminLayout.tsx` — if there's a sidebar link to `/admin/landing`, no change needed since the route still exists.

No database, RLS, or `heroSlides.ts` changes — purely a UI/routing reorganization.
