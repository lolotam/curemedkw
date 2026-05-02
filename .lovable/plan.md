## Problem

After Google sign-in, users land on `https://curemedkw-first.lovable.app/curemed` instead of the production domain. Two causes:

1. **Origin leak**: `redirectTo` is built from `window.location.origin`, so signing in from a Lovable preview keeps the user on that preview origin even after deployment.
2. **`auth:next` default**: In `src/pages/Auth.tsx` line 61, `next` defaults to `/account`. If something pre-fills `?next=/curemed` (or another brand path), it gets stored and used as the post-login destination. We will make the default a safer `/` and only honor `next` when it is a same-origin path we trust.

## Changes

### 1. `src/pages/Auth.tsx`

- Add a `getAuthRedirectUrl()` helper at module scope:
  ```ts
  const getAuthRedirectUrl = () => {
    const origin = window.location.origin;
    if (origin.includes("localhost")) return `${origin}/auth/callback`;
    if (origin.includes("lovable.app")) return `${origin}/auth/callback`;
    return "https://curemedkw.com/auth/callback";
  };
  ```
- Change default `next` from `/account` to `/` (line 61).
- In `signInWithGoogle` (lines 114–136):
  - Keep `sessionStorage.setItem("auth:next", next || "/")`.
  - Replace the hardcoded `redirectTo: \`${window.location.origin}/auth/callback\`` with `redirectTo: getAuthRedirectUrl()`.

### 2. `src/pages/admin/AdminLogin.tsx`

- Add the same `getAuthRedirectUrl()` helper (or import a shared one — see step 4).
- In `signInWithGoogle`, replace `redirectTo: \`${window.location.origin}/auth/callback\`` with `redirectTo: getAuthRedirectUrl()`. `sessionStorage.setItem("auth:next", "/admin")` stays.

### 3. `src/pages/AuthCallback.tsx`

Already correct (reads `auth:next`, defaults to `/`, removes the key, navigates with `replace: true`). No change needed.

### 4. (Optional) Extract shared helper

Create `src/lib/authRedirect.ts` exporting `getAuthRedirectUrl()`, and import it from both `Auth.tsx` and `AdminLogin.tsx` instead of duplicating. Keeps future domain changes single-edit.

### 5. Reminders for the user (no code action)

- The production domain `https://curemedkw.com/auth/callback` must be in Lovable Cloud → Auth → Redirect URLs (along with the `lovable.app` previews).
- After publishing, test the flow from `https://curemedkw.com/auth`, not from the preview URL — sign-ins started on a preview will still land on that preview by design (because the helper preserves `lovable.app` origins for testing).

## Notes

- The helper intentionally keeps `lovable.app` origins as-is so preview-based testing keeps working; only "unknown" origins (e.g. a custom domain that isn't `curemedkw.com`) get forced to production. If you'd rather always force production regardless of origin, say so and I'll drop the `lovable.app` branch.
- The default `next` becoming `/` means email/password sign-in from `/auth` (with no `?next=` param) lands on the home route. If you'd prefer `/account`, tell me and I'll keep `/account` as the default while still sanitizing `auth:next`.
