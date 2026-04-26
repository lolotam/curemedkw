## Plan

Fix the category add/edit dialog so the Save button is reliably visible and usable in both flows.

### What I’ll change
1. Update the shared dialog component so portaled dialog content can inherit the active Curemed brand variables even when rendered outside the admin layout container.
2. Keep the category editor footer layout stable so both action buttons stay visible at the bottom of the dialog.
3. Replace the Save button’s styling in the category form with a durable brand-safe variant/class combination that remains visible even if CSS variables are missing.
4. Audit other admin dialogs that use brand-colored actions inside portals and apply the same protection where needed.

### Expected result
- Add category: Save button is visible immediately.
- Edit category: Save button stays visible.
- The button keeps a strong branded appearance instead of disappearing into the white dialog background.
- Similar admin dialogs won’t regress for the same reason.

### Technical details
- `src/components/ui/dialog.tsx`
  - Extend `DialogContent` so it can carry the active brand context into the portal, instead of depending on a parent `[data-brand]` wrapper that no longer exists after portaling.
- `src/pages/admin/AdminCategories.tsx`
  - Keep the dialog as a three-row layout (`header / scrollable body / footer`) and ensure the footer actions remain visible.
  - Update the Save button styling so it does not become white-on-white when `--brand-primary` is unavailable.
- Related admin dialog audit
  - Review portaled admin dialogs using `bg-brand` buttons and align them to the safer pattern.

### Root cause confirmed
The category form is rendered inside a portaled dialog. The admin brand variables are defined on `AdminLayout` via `data-brand="curemed"`, but the dialog is mounted under `document.body`, outside that branded wrapper. Because of that, `.bg-brand` can resolve to no background color, while `text-white` still applies, making the Save button appear missing even though it is still in the DOM and clickable.