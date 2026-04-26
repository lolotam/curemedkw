## Problem

In **Edit category** (and Add category) on `/admin/categories`, the dialog footer only shows **Cancel** — the **Save** button is invisible/clipped, as the screenshot confirms.

## Root cause

`DialogContent` (from `src/components/ui/dialog.tsx`) is a CSS **`grid`** container by default. In `AdminCategories.tsx` we override it with `flex flex-col max-h-[90vh] p-0`, but the base `grid` class is still applied first, so the layout is a grid container that ignores `flex-col`/`flex-1`. Result:

1. The scroll area's `flex-1` does nothing → it grows to fit content instead of scrolling.
2. The footer's `sticky bottom-0` has no flex parent to anchor to → it can sit mid-dialog while the form fields overflow beneath it.
3. On narrow viewports `DialogFooter` uses `flex-col-reverse` (Save above Cancel). With the broken layout, Save ends up scrolled off-screen.

So the Save button is rendered in the DOM but hidden below the visible viewport.

## Fix (one file: `src/pages/admin/AdminCategories.tsx`)

### 1. Neutralize the conflicting `grid` on `DialogContent`

Change the className on the editor's `DialogContent` from:

```tsx
<DialogContent className="max-w-lg flex flex-col max-h-[90vh] p-0">
```

to:

```tsx
<DialogContent className="max-w-lg !grid-cols-1 grid-rows-[auto_1fr_auto] max-h-[90vh] p-0 gap-0 overflow-hidden">
```

This keeps the shadcn `grid` layout but pins it to a 3-row template (header / scroll area / footer) so the middle row is the only one that scrolls, and the footer is always visible at the bottom.

### 2. Make the middle section the scrollable row

Change the inner wrapper from:

```tsx
<div className="space-y-4 px-6 py-4 overflow-y-auto flex-1">
```

to:

```tsx
<div className="space-y-4 px-6 py-4 overflow-y-auto min-h-0">
```

(`min-h-0` lets a grid row shrink so `overflow-y-auto` actually scrolls.)

### 3. Force the footer onto a single row so Save is never hidden

Change:

```tsx
<DialogFooter className="px-6 py-4 border-t border-border bg-background sticky bottom-0">
```

to:

```tsx
<DialogFooter className="px-6 py-4 border-t border-border bg-background flex-row justify-end gap-2">
```

Removes `sticky` (no longer needed — the grid row anchors it) and forces `flex-row` so on narrow screens Save isn't pushed off-screen by `flex-col-reverse`.

## Verification

After changes, on `/admin/categories` → click pencil on any category → confirm:

- The dialog is capped at 90vh.
- Form fields scroll inside the middle area.
- Footer with **Cancel** *and* the brand-blue **Save** button is always pinned to the bottom of the dialog and fully visible.
- Save is enabled when name + slug are filled and shows "Saving…" while submitting.

## Files to edit

- `src/pages/admin/AdminCategories.tsx` — the three className tweaks described above on the dialog's `DialogContent`, scroll wrapper, and `DialogFooter`.

No DB or other component changes required.
