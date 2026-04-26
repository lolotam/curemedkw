## Two small fixes

### 1) Add Category — Save button is "missing"

**Root cause:** The Save button does exist in `DialogFooter`, but on a fresh "Add category" open it appears **disabled (greyed out)** because the form state never resets correctly. The dialog uses `useMemo(() => { ... }, [editing])` to reset form state — `useMemo` is not the right hook for side effects (calling `setForm` during render). On the first open after a previous edit, the form keeps stale values or shows as invalid, and the button looks unresponsive / hidden behind state.

There's also a secondary UX problem: the footer can scroll out of view on smaller screens because the dialog body has no max-height / scroll.

**Fix in `src/pages/admin/AdminCategories.tsx` (`CategoryEditorDialog`):**
- Replace the `useMemo` reset with a proper `useEffect` keyed on `editing` so the form resets cleanly every time the dialog opens (BLANK for "new", populated for edit).
- Make the Save button always visible:
  - Keep `disabled` only while a save is in flight (track a local `saving` state), not based on empty fields. Show inline validation hints under Name/Slug instead.
  - Wrap the dialog body in `max-h-[70vh] overflow-y-auto` and keep `DialogFooter` outside the scroll area so Save/Cancel are always pinned and visible.
- Also call `onSave` inside a `try/finally` that toggles `saving`, and make the button label switch to "Saving…" while pending.

### 2) Hero section — true 16:9 frame

**Current:** `src/components/site/HeroSlider.tsx` uses `h-[70vh] min-h-[460px] max-h-[760px]` — that's viewport-relative, so the media is cropped (object-cover) to fit, never matching the source 16:9.

**Fix:**
- Replace the viewport-height wrapper with an aspect-ratio container so the section itself is exactly 16:9 of its width:
  - Outer: `relative w-full overflow-hidden bg-brand-deep` with `aspect-[16/9]` (Tailwind built-in).
  - Remove `h-[70vh] min-h-[460px] max-h-[760px]`.
- Keep `object-cover` on `<img>` / `<video>` so any non-16:9 source still fills, but a 16:9 source will display pixel-perfect with no crop.
- Keep the existing overlay, text block, arrows, and dots — they already use `absolute inset-0` so they'll adapt automatically.
- The text block currently uses `h-full flex items-center` inside `container` — that stays the same; on very wide screens the 16:9 frame can become tall, which is the desired behavior to "fit the image/video exactly".

**Optional safety cap (will include):** add `max-h-[85vh]` on the outer wrapper so on ultra-wide monitors the hero doesn't push everything off-screen, while still preserving the 16:9 frame on all common viewports.

### Files to edit
- `src/pages/admin/AdminCategories.tsx` — fix dialog reset (useEffect), always-enabled Save with saving state, scrollable body / pinned footer.
- `src/components/site/HeroSlider.tsx` — swap fixed viewport height for `aspect-[16/9]` wrapper (with optional `max-h-[85vh]` cap).

No DB / edge function / route changes needed.