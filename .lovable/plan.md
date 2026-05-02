## Changes

### 1. Rewrite `src/pages/AuthCallback.tsx` (PKCE-aware)

Replace full file with handler that:
- Reads `code` from `window.location.search`.
- If `code` exists → `await supabase.auth.exchangeCodeForSession(code)`.
- Calls `supabase.auth.getSession()`.
- On session present: `window.history.replaceState({}, document.title, "/auth/callback")`, then navigate to `sessionStorage.getItem("auth:next") || "/"` and remove `auth:next`.
- On exchange failure → navigate `/auth?error=oauth_callback_failed`.
- On no session → navigate `/auth?error=oauth_no_session`.
- Uses a `cancelled` flag to avoid navigation after unmount.
- Keeps existing spinner + "Signing you in…" UI.

### 2. `src/pages/Auth.tsx` — unchanged

Already uses `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: \`${window.location.origin}/auth/callback\`, queryParams: { prompt: "select_account" } } })`.

### 3. `src/App.tsx` — unchanged

`/auth/callback` route already registered.

### 4. `src/pages/admin/AdminLogin.tsx` — admin cleanup

In `signInWithGoogle`:
- Add `sessionStorage.setItem("auth:next", "/admin")` before the OAuth call.
- Change `redirectTo` from `${origin}/admin` to `${origin}/auth/callback`.

### 5. Verify no remaining managed-OAuth references

Grep for `lovable.auth.signInWithOAuth`, `/~oauth/initiate`, `/~oauth/callback` in `src/` and confirm none remain in active call sites.

### 6. Publish

Remind the user to click Publish → Update so the new bundle reaches `curemedkw.com` (production currently still serves the old build).

## Notes for the user (no code action)

- Google Cloud Console authorized redirect URI: `https://lgcuwsjlxkntwzlgjtzp.supabase.co/auth/v1/callback`.
- Lovable Cloud → Auth → Redirect URLs must include:
  - `https://curemedkw.com/auth/callback`
  - `https://www.curemedkw.com/auth/callback`
  - `https://curemedkw.lovable.app/auth/callback`
