# Google Sign-In Diagnosis

## What I checked
- `src/pages/Auth.tsx` (lines 115–137): correctly calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getAuthRedirectUrl(), queryParams: { prompt: 'select_account' } } })`.
- `src/pages/AuthCallback.tsx`: correctly handles `?code=...` via `exchangeCodeForSession` and falls back to `getSession`.
- `src/lib/authRedirect.ts`: returns `https://curemedkw.com/auth/callback` in production, `${origin}/auth/callback` for localhost / lovable.app.
- `src/integrations/supabase/client.ts` + `.env`: pointing to `https://supabase.curemedkw.com` with the new anon key.
- Route `/auth/callback` is registered in `App.tsx`.

**Conclusion: the React code is fine.** The failure is in the self-hosted Supabase (GoTrue) configuration created during the recent Dokploy migration — not in the app.

## Most likely root causes (in order)

1. **GoTrue (Auth) on Dokploy is missing/incorrect Google provider env vars.** After the migration the new self-hosted stack must have:
   - `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true`
   - `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<your Google client id>`
   - `GOTRUE_EXTERNAL_GOOGLE_SECRET=<your Google client secret>`
   - `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.curemedkw.com/auth/v1/callback`
2. **`SITE_URL` / `URI_ALLOW_LIST` not updated** on the new GoTrue:
   - `GOTRUE_SITE_URL=https://curemedkw.com`
   - `GOTRUE_URI_ALLOW_LIST=https://curemedkw.com/*,https://*.lovable.app/*,http://localhost:5173/*,http://localhost:3000/*`
   Without this, GoTrue refuses to redirect back to `/auth/callback` and you get `redirect_to mismatch` / `bad_oauth_state`.
3. **Google Cloud Console authorized redirect URI still points to the old `*.supabase.co` callback.** It must include:
   - `https://supabase.curemedkw.com/auth/v1/callback`
4. **API URL / external URL mismatch.** GoTrue must know its public URL:
   - `API_EXTERNAL_URL=https://supabase.curemedkw.com`
   - `GOTRUE_API_EXTERNAL_URL=https://supabase.curemedkw.com`
5. **Kong/proxy not routing `/auth/v1/*` correctly** — common Dokploy pitfall when only the REST route is exposed.

## What I need from you to confirm
Open Google sign-in once and tell me which of these you see:
- A. Google account picker never appears (instant error in app) → cause #1 or #5.
- B. Picker appears, then redirects to a Supabase URL that shows an error JSON (e.g. `{"error":"redirect_to mismatch"}`, `bad_oauth_state`, `provider is not enabled`) → cause #1 or #2.
- C. Returns to `/auth/callback` then bounces to `/auth?error=oauth_no_session` or `oauth_callback_failed` → cause #2 (cookie/session not set; usually `SITE_URL` mismatch or third-party cookie blocked because callback host differs from app host).
- D. 404 / 502 from `https://supabase.curemedkw.com/auth/v1/authorize?...` → cause #5 (Kong route missing).

The exact URL in the address bar when it fails (you can redact tokens) will tell me which one immediately.

## Fix plan (server-side, on Dokploy — no app code changes)

Step 1 — Update Dokploy env vars on the `auth` (GoTrue) service:
```text
API_EXTERNAL_URL=https://supabase.curemedkw.com
GOTRUE_SITE_URL=https://curemedkw.com
GOTRUE_URI_ALLOW_LIST=https://curemedkw.com/*,https://*.lovable.app/*,http://localhost:5173/*,http://localhost:3000/*
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<paste>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<paste>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.curemedkw.com/auth/v1/callback
```
Then restart the `auth` container.

Step 2 — In Google Cloud Console → Credentials → your OAuth Client → Authorized redirect URIs, add:
```text
https://supabase.curemedkw.com/auth/v1/callback
```
Keep the old one only if you still use the old project; otherwise remove it.

Step 3 — Verify Kong route. Hit this in a browser:
```text
https://supabase.curemedkw.com/auth/v1/health
```
You should get `{"name":"GoTrue", ...}`. If you get 404/502, fix the Kong `auth-v1-open` route in your Dokploy stack before anything else.

Step 4 — Smoke test:
- Open `https://curemedkw.com/auth`, click "Continue with Google".
- Expected flow: Google picker → `https://supabase.curemedkw.com/auth/v1/callback?code=...` → `https://curemedkw.com/auth/callback?code=...` → home page, signed in.

## What I will change in code
**Nothing**, unless after step 1–3 we still see issue C above. In that case I will:
- Add a small log inside `AuthCallback.tsx` to surface the exact GoTrue error (`error_description` from URL hash), so we can see the real reason instead of a generic `oauth_callback_failed`.

## Notes on the warnings in your console
The two warnings about `Function components cannot be given refs` (`SlideAnimatedText`, `FeaturedGlassCard`) are unrelated to auth. We can fix those separately by wrapping those two components in `React.forwardRef` if you want — say the word and I'll do it in a follow-up.

Reply with which symptom (A/B/C/D) you observe, or paste the failing URL, and I'll either confirm the server fix or push the small `AuthCallback` logging patch.
