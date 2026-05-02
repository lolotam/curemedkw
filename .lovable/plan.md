## 1. Google Sign-in error (`Error 400: redirect_uri_mismatch`)

This is **not a code bug** — it's a configuration mismatch in your Google Cloud OAuth client.

Your app uses Lovable Cloud's managed authentication. When a user clicks "Continue with Google", Supabase Auth redirects them to Google using a fixed callback URL on the Supabase project:

```
https://lgcuwsjlxkntwzlgjtzp.supabase.co/auth/v1/callback
```

Looking at your screenshot of Google Cloud Console, your OAuth client only lists:
- `https://curemedkw.lovable.app/~oauth/callback`

That `~oauth/callback` URL belongs to a different (newer) Lovable OAuth flow. Your project still uses the classic Supabase Google provider (`supabase.auth.signInWithOAuth`), so Google rejects the request because the Supabase callback isn't on the allowlist.

### Fix (no code change needed) — you do this in Google Cloud Console:

In your OAuth 2.0 Client (`curemed`) → **Authorized redirect URIs**, add:

```
https://lgcuwsjlxkntwzlgjtzp.supabase.co/auth/v1/callback
```

Keep your existing entries. Save, wait ~1 minute, then retry Google sign-in.

Also confirm in **Authentication settings** of Lovable Cloud that Google provider is enabled and that the **Client ID** and **Client Secret** from this Google OAuth client are pasted in. If they're not, signing in with Google will fail even after the redirect URI is fixed.

### Why this happens only with your custom credentials
Lovable Cloud ships with managed Google OAuth that "just works". The error appears because you've configured your own Google OAuth client (visible in your screenshot), and its redirect URI list is incomplete.

---

## 2. Add Privacy Policy and Terms of Service pages

### New files
- `src/pages/PrivacyPolicy.tsx` — wrapped in `SiteLayout`, contains a Curemed-tailored privacy policy (data we collect: name, email, phone, address for orders; cookies; analytics; how to contact us; user rights). Bilingual via `useI18n()` for headings, with body content in EN/AR.
- `src/pages/TermsOfService.tsx` — wrapped in `SiteLayout`, contains terms (acceptance, products & pricing in KWD, ordering, payment via COD/pay-by-link, delivery in Kuwait, returns, liability, governing law = Kuwait). Bilingual.

### Routing — `src/App.tsx`
Add lazy imports and two new public routes:
```
<Route path="/privacy-policy" element={<PrivacyPolicy />} />
<Route path="/terms-of-service" element={<TermsOfService />} />
```

### Footer — `src/components/site/SiteFooter.tsx`
Inside the existing brand-name column (currently has Home / About / Contact), add two more `<li>` entries linking to `/privacy-policy` and `/terms-of-service`, using new translation keys.

### Translations — `src/lib/i18n.tsx`
Add keys:
- `nav.privacyPolicy` → "Privacy Policy" / "سياسة الخصوصية"
- `nav.termsOfService` → "Terms of Service" / "الشروط والأحكام"
- Page heading + section keys for each page (or inline EN/AR via `lang`).

---

## What I will NOT change
- `src/integrations/supabase/client.ts` (auto-generated)
- The auth flow code itself — it's correct; only the Google Console config is wrong.
