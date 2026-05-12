## Add "Show in main carousel" toggle to categories

A new per-category flag controls whether a category appears as a tile in the home/brands `CategoryCarousel`. It is independent of the existing **Active** flag.

### Database
Add column to `public.categories`:
- `show_in_carousel boolean NOT NULL DEFAULT true`

Default `true` so current categories keep showing. No RLS changes (existing policies cover it).

### Types & data layer (`src/lib/db.ts`)
- Add `showInCarousel: boolean` to `Category` and `CategoryInput`.
- Map `show_in_carousel` ↔ `showInCarousel` in row → object and in the update/insert payload builder.
- Update `BLANK` defaults in `AdminCategories.tsx` and `AdminProductEditor.tsx` to include `showInCarousel: true`.

### Admin UI (`src/pages/admin/AdminCategories.tsx`)
- In the **Add / Edit category** dialog: place a Switch immediately to the right of the existing **Active** checkbox row, labeled **"Show in main carousel"** with a small helper hint ("Appears on the home and brand pages carousel").
- Use the shadcn `Switch` already imported. Keep it on the same row using flex.
- (Optional) Reflect state in the categories list as a small icon — out of scope for this change unless requested.

### Site (`src/components/site/CategoryCarousel.tsx`)
Filter tiles by both flags:
```ts
categories.filter(c => c.isActive && c.showInCarousel)
```

### Out of scope
- No changes to other admin pages, RLS, or the products table.
- No backfill UI — existing rows default to `true` via column default.