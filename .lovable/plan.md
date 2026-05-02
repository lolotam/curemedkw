## Audit results

I searched the codebase for every term you listed:

- `yjvqzvmyritxegugfhkt` — **0 matches**. The old Supabase project ID does not appear anywhere in source.
- `oauth.lovable.app` — **0 matches**.
- `/~oauth/initiate` and `/~oauth/callback` — **0 matches**.
- `lovable.auth.signInWithOAuth` — **0 matches in app code**. The only definition lives in `src/integrations/lovable/index.ts` (an auto-generated wrapper) and is **never imported anywhere**.

Current state of the auth flow:

- `src/integrations/supabase/client.ts` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from env. Local `.env` already points at `https://lgcuwsjlxkntwzlgjtzp.supabase.co`. The Supabase client only knows about the new project.
- `src/pages/Auth.tsx` and `src/pages/admin/AdminLogin.tsx` already call `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: getAuthRedirectUrl(), queryParams: { prompt: "select_account" } } })` — direct Supabase OAuth, no Lovable broker.
- `src/pages/AuthCallback.tsx` already does the PKCE exchange (`exchangeCodeForSession(code)`), then `getSession()`, then navigates to `sessionStorage.getItem("auth:next") || "/"`.

So the live redirect to `yjvqzvmyritxegugfhkt.supabase.co/auth/v1/callback` is **not coming from the current source**. It can only come from one of:

1. The deployed Dokploy build still using old `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` build args (build-time inlined into the bundle).
2. The new Supabase project's Google provider being misconfigured (Google Cloud OAuth client still has the old project's `/auth/v1/callback` as its redirect URI), so Google itself bounces to the old URL.

Both are infra/config, not code. The code is already correct.

## Cleanup the plan will perform

Even though it is not the cause of the bug, I will remove the dead Lovable-managed-OAuth scaffolding so future regressions cannot reintroduce it:

1. **Delete** `src/integrations/lovable/index.ts` (unused; it's the only file that calls `lovable.auth.signInWithOAuth` and imports `@lovable.dev/cloud-auth-js`).
2. **Remove** the `@lovable.dev/cloud-auth-js` dependency from `package.json` (`bun remove @lovable.dev/cloud-auth-js`).
3. **Verify** with `rg` that none of the forbidden strings remain after the cleanup.

No changes to `Auth.tsx`, `AdminLogin.tsx`, `AuthCallback.tsx`, `authRedirect.ts`, or the Supabase client — they already match the spec in your message.

## What you must do outside the code (for the live bug to actually go away)

1. In Dokploy, set build args / env:
   ```
   VITE_SUPABASE_URL=https://lgcuwsjlxkntwzlgjtzp.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<new project anon key>
   VITE_SUPABASE_PROJECT_ID=lgcuwsjlxkntwzlgjtzp
   ```
   Then **rebuild** (Vite inlines these at build time — restarting the container is not enough).
2. In the **new** Supabase project (`lgcuwsjlxkntwzlgjtzp`):
   - Authentication → URL Configuration → Site URL: `https://curemedkw.com`
   - Add redirect URLs: `https://curemedkw.com/auth/callback`, `https://curemedkw.lovable.app/auth/callback`, `http://localhost:*/auth/callback`.
   - Authentication → Providers → Google: enter the Google OAuth Client ID/Secret and copy the callback URL it shows (it will be `https://lgcuwsjlxkntwzlgjtzp.supabase.co/auth/v1/callback`).
3. In Google Cloud Console → that OAuth Client → **Authorized redirect URIs**, replace the old `https://yjvqzvmyritxegugfhkt.supabase.co/auth/v1/callback` with the new one above. This is almost certainly what is still sending users to the dead project.

After approval I will execute step 1–3 of the cleanup section.
