## Add "Active" column to Categories table

Edit only `src/pages/admin/AdminCategories.tsx`.

### Changes
1. Add a new `<th>` "Active" between the **Products** and **Actions** headers.
2. Add a matching `<td>` per row containing a `Switch` (already in `@/components/ui/switch`) bound to `c.isActive`. Toggling calls `updateMut.mutate({ id: c.id, patch: { isActive: !c.isActive } })` with success/error toasts.
3. Show a small muted label next to the switch ("Active" / "Inactive") so the state is readable at a glance. Inactive rows get `opacity-60` for visual clarity.
4. Update `colSpan={9}` on the empty-state row to `colSpan={10}`.

### Out of scope
No DB, schema, RLS, or backend changes (`is_active` already exists). No changes to the editor dialog, filters, or other admin pages.