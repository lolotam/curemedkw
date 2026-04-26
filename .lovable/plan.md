## Goal

Give admins a clear, real-time view of unread contact messages in two places:

1. A small **red unread-count badge** next to the "Messages" item in the admin sidebar nav.
2. A **bell notification icon in the public site header** (visible only to admins) that opens a **slide-out panel** listing recent messages. Clicking any message navigates to `/admin/messages` with that message preselected.

---

## 1. Admin sidebar — red unread badge on "Messages"

**File:** `src/components/admin/AdminLayout.tsx`

- Import `useUnreadMessageCount` from `@/lib/db` (already exists, returns count of `messages` where `read = false`).
- In the `NAV.map(...)` render, when the item is the Messages link and `unreadCount > 0`, render a small red pill at the right edge of the nav row:
  - Style: `ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold`.
  - Show `unreadCount` (cap display at `99+`).
- The badge will auto-update because the existing mutations (`useMarkMessageRead`, `useDeleteMessages`, `useCreateMessage`) already invalidate `qk.unreadCount`.

---

## 2. Public site header — admin-only notification bell

**File:** `src/components/site/SiteHeader.tsx`

- Import `useAdminSession` from `@/lib/admin` and `useUnreadMessageCount` + `useMessages` from `@/lib/db`.
- Render the bell only when `isAdmin === true`. Place it in the right-side button cluster, just before the language toggle.
- Bell button:
  - Icon: `Bell` from lucide-react, `variant="ghost" size="icon"`, `aria-label="Notifications"`.
  - When `unreadCount > 0`, overlay a small red dot/badge in the top-right corner of the icon (absolute-positioned span with `bg-destructive`, count text if > 0, capped at `99+`).
- Clicking the bell opens a **Sheet** (right-aligned slide-out) — use the existing `@/components/ui/sheet` component.

### Slide-out panel content (Sheet)

- **Header:** "Notifications" title + small subtitle "X unread of Y total".
- **Body:** scrollable list of the most recent ~20 messages from `useMessages()`.
  - Each row shows: sender name (bold if unread), subject (truncated), short preview of message, relative date, and a small red dot for unread.
  - Hover state with `hover:bg-muted/50`.
  - On click: close the sheet, then `navigate("/admin/messages", { state: { focusMessageId: m.id } })`.
- **Footer:** "View all messages" button → navigates to `/admin/messages` and closes the sheet.
- Empty state: `Bell` icon + "No messages yet."

### Important: only fetch messages when needed

The `messages` table SELECT policy requires `has_role(auth.uid(), 'admin')`, so calling `useMessages()` for non-admins would error. To avoid this:

- Call `useUnreadMessageCount()` and `useMessages()` only when `isAdmin` is `true`. Implement by gating with `enabled: isAdmin` — easiest path is to add a small wrapper inside `SiteHeader` that conditionally renders an `<AdminBell />` subcomponent only when `isAdmin` is true; that subcomponent is the only place the hooks are called. This keeps the hook order stable for non-admins and avoids any RLS errors.

---

## 3. Auto-focus selected message in `/admin/messages`

**File:** `src/pages/admin/AdminMessages.tsx`

- Read `location.state?.focusMessageId` via `useLocation()`.
- In a `useEffect` watching `[all, focusMessageId]`, when the message exists in the loaded list, call the existing `open(message)` flow (which sets `active` and marks it read).
- After consuming, clear the state via `navigate(".", { replace: true, state: {} })` so refresh won't re-trigger.

---

## 4. Realtime updates (nice-to-have, kept simple)

The existing React Query invalidations already keep the badge fresh after admin actions in this tab. For new incoming messages from public visitors, the badge will refresh whenever the admin navigates or React Query refetches on window focus (default behavior). No DB changes are needed for this request.

If you'd like true push updates later (badge increments the moment a visitor submits the contact form), we can enable Supabase Realtime on the `messages` table in a follow-up — not included in this plan to keep the change minimal.

---

## Files to be edited

- `src/components/admin/AdminLayout.tsx` — add unread badge to the Messages nav item.
- `src/components/site/SiteHeader.tsx` — add admin-only `<AdminBell />` with `Sheet` slide-out and notification list.
- `src/pages/admin/AdminMessages.tsx` — auto-open message when arriving with `state.focusMessageId`.

No DB schema changes. No new dependencies (Sheet, Bell icon, and all hooks already exist).