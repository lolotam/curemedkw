## Problem

When an admin clicks **Admin** in the user dropdown, they briefly see an "Authorization" / "Not authorized" dialog before landing on the dashboard. Root cause is in `src/lib/admin.ts`:

- `useAdminSession()` sets `loading = false` as soon as `getSession()` resolves.
- The `isAdmin` role lookup against `user_roles` is a **separate async call** that finishes a moment later.
- During that gap, `AdminLayout` sees `loading=false`, `user=set`, `isAdmin=false` → it renders the red **"Not authorized"** card. When the role query resolves, `isAdmin` flips to `true` and the real dashboard appears. That's the flicker the user is seeing.

The dropdown logic itself is already correct: `SiteHeader.tsx` renders the **Admin** menu item only when `isAdmin === true` from the same hook. We just need that flag to be trustworthy on first paint.

## Fix

### 1. `src/lib/admin.ts` — make `loading` cover the role check too
- Add an internal `roleLoading` state.
- `loading` returned by the hook becomes `sessionLoading || (user && roleLoading)`.
- Set `roleLoading = true` whenever a user is detected (initial session + auth state changes) and flip it to `false` only after the `user_roles` query resolves (or immediately when there is no user).
- Keep the existing "subscribe first, then getSession" order to avoid races.

### 2. `src/components/admin/AdminLayout.tsx` — no behavior change needed
Once `loading` correctly waits for the role check, the existing branches work as intended:
- `loading` → spinner
- `!user` → redirect to `/admin/login`
- `user && !isAdmin` → "Not authorized" (only real non-admins now)
- otherwise → dashboard

### 3. `src/components/site/SiteHeader.tsx` — confirm-only
Already gated by `{isAdmin && …}` in `UserMenu`. With the fix above, `isAdmin` is only `true` after the `user_roles` row is confirmed, so non-admins never see the menu item. No code change required.

## Out of scope
- No DB / RLS / auth-provider changes.
- No changes to `AdminLogin`, routing, or the dropdown markup.

## Files touched
- `src/lib/admin.ts` (small refactor of the hook)
