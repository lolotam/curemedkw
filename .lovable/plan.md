# Move Admin Dashboard Link

Currently the "Admin" link appears in the site footer and is visible to everyone. We'll remove it from the footer and instead show it only inside the logged-in user dropdown menu (the avatar/user icon in the header) — and only when the signed-in user actually has admin privileges.

## Changes

### 1. `src/components/site/SiteFooter.tsx`
- Remove the `<li><Link to="/admin">{t("nav.admin")}</Link></li>` item from the bottom-right brand links list.

### 2. `src/components/site/SiteHeader.tsx`
- The file already imports `useAdminSession` from `@/lib/admin`. In the user dropdown component (around lines 288–310), call `useAdminSession()` to get `isAdmin`.
- When `isAdmin` is true, add a new `DropdownMenuItem` (with a Shield icon from `lucide-react`) labeled "Admin Dashboard" that navigates to `/admin`. Place it above the sign-out separator, with its own separator above it for visual grouping.
- Non-admin users see no admin entry — the dropdown stays exactly as it is today (Account, My Orders, Sign out).

## Result
- Footer no longer exposes an Admin link to public visitors.
- Admin users get a quick-access "Admin Dashboard" entry directly inside their account dropdown.
- Regular users see no change in their dropdown.

No translation keys, routes, or other files need changes (`nav.admin` key already exists and will be reused for the dropdown label).