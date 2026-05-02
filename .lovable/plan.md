## Goal
Improve the Security tab in `src/pages/Account.tsx` so Google-only users (no password yet) see a clearer "Set Password" UI, while email/password users continue to see "Change Password".

## Changes

### 1. `src/pages/Account.tsx`
- Detect whether the signed-in user has a password identity:
  ```ts
  const providers = (user.app_metadata?.providers as string[]) || [];
  const hasPassword = providers.includes("email");
  const isGoogleOnly = !hasPassword && providers.includes("google");
  ```
- In the **Security** tab card:
  - Heading: `t("account.setPassword")` if `!hasPassword`, else `t("account.changePassword")`.
  - If `isGoogleOnly`, render a small info note above the form using `t("account.setPasswordHint")` (muted text, with a Google icon for clarity).
  - Submit button label stays `t("auth.updatePassword")` (works for both create and update — Supabase's `updateUser({ password })` handles both cases).
- No change to the actual `changePassword` handler — `supabase.auth.updateUser({ password })` already creates a password for OAuth-only users.

### 2. `src/lib/i18n.tsx`
Add two new translation keys (EN + AR):
- `account.setPassword` → "Set a password" / "تعيين كلمة مرور"
- `account.setPasswordHint` → "You signed in with Google. Set a password to also enable email & password login with the same account." (+ Arabic translation)

## Out of scope
- No DB / auth config changes — the capability already exists server-side.
- No changes to the sign-in flow or `Auth.tsx`.

## Result
- Google-only users see: **"Set a password"** + an explanatory hint, then can create one and afterward log in with either Google or email/password.
- Existing email/password users see the unchanged **"Change password"** form.
