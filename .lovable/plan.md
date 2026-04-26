# Plan — Row numbering + Subcategory management

## 1. Row numbering (`#` column) on three admin tables

Add a leading `#` column to each table. Numbering is the visible 1-based index of the **currently filtered/sorted view** (so it always reads `1, 2, 3…` after a search or filter — not a stable DB number).

Files:
- `src/pages/admin/AdminProducts.tsx` — add `<th>#</th>` and `<td>{i + 1}</td>` from the `list.map((p, i) => …)` loop.
- `src/pages/admin/AdminCategories.tsx` — same treatment on `filtered.map((c, i) => …)`.
- `src/pages/admin/AdminTags.tsx` — same treatment on `tags.map((t, i) => …)`.

Style: narrow column (`w-12`), muted color, monospace digits so the column stays aligned.

---

## 2. Subcategory support

The `categories.parent_id` column already exists (uuid, nullable, no FK constraint). No schema change needed — just wire it up.

### 2a. Data layer (`src/lib/db.ts`)
- Confirm `Category` and `CategoryInput` already expose `parentId: string | null` (they do based on the editor code). If `parentId` is missing from the row mapper or input mapper, add it on both sides.
- Add a small helper `useCategoryTree()` that returns categories grouped as `{ parent: Category, children: Category[] }[]`, plus orphans (parent_id pointing to a deleted row → treated as top-level).
- Guard against cycles in the update path: when changing `parentId`, refuse if the chosen new parent is the category itself or any of its descendants.

### 2b. Categories table UI (`src/pages/admin/AdminCategories.tsx`)
- Render as a **two-level tree**:
  - Parent rows shown first.
  - Child rows shown directly under their parent, with a left indent (`pl-10`), a small `↳` glyph, and lighter background.
- Add a per-parent-row action **"Add subcategory"** (small `+` button next to the edit/delete icons) that opens the editor pre-filled with `parentId` set to that parent.
- Add a top-bar **"Add category"** button (already exists) — keeps creating top-level categories (`parentId: null`).
- Each row keeps its own edit & delete actions. Deleting a parent that still has children: prompt the user → "This category has N subcategories. Delete them too, or move them to top-level?" with three buttons: *Cancel*, *Move to top-level*, *Delete all*.

### 2c. Editor dialog changes (same file, `CategoryEditorDialog`)
Add a **"Parent category"** field (a searchable `Select` from shadcn) right under the Slug field:
- Options: `— Top-level —` plus every other category, **excluding the current category and any of its descendants** (cycle protection).
- Saving with a different parent re-parents the category. This is exactly the "transfer subcategory between parents" capability requested.
- Visual hint under the field: `"Leaving this empty makes it a top-level category."`

### 2d. Public site usage (no behavior change required now)
- `CategoryCarousel` and brand pages keep using the flat list. Subcategories will simply also appear in the carousel until you decide to filter them out — I'll add a one-line filter `categories.filter(c => !c.parentId)` in the carousel so only top-level categories show in marketing carousels by default. Subcategory pages will still resolve correctly via slug.

---

## Out of scope (will not change)
- No DB migration (column exists).
- No changes to product → category linking; products keep linking to whichever category (parent or child) is selected.
- Visibility-per-page checkboxes from the previous request are not part of this turn (still pending the earlier proposal).

## Files touched
- `src/pages/admin/AdminProducts.tsx`
- `src/pages/admin/AdminCategories.tsx`
- `src/pages/admin/AdminTags.tsx`
- `src/lib/db.ts`
- `src/components/site/CategoryCarousel.tsx` (one-line top-level filter)
