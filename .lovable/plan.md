## Goal
Let admins change the Postora API key from `/admin/whatsapp` UI. Saving updates the database, and the `send-whatsapp` edge function picks it up immediately — no redeploy, no secret editing. Works the same on Lovable Cloud and on self-hosted Supabase.

## Approach
Store the Postora API key inside the existing `whatsapp_integration` row in `site_settings` (jsonb), and make the edge function read from there first, falling back to the `POSTORA_WHATSAPP_API_KEY` env var only if the DB value is empty.

This way:
- Admin pastes a new key in the UI → hits **Save** → DB updated → next message uses the new key.
- Switching Postora accounts = paste new key, save. Done.
- Self-hosted deployments work identically (it's just a row in `site_settings`).

## Changes

### 1. Frontend — `src/pages/admin/AdminWhatsApp.tsx`
- Extend `WaSettings` with `api_key: string`.
- Add a new card **"Postora API key"** above "Admin numbers" containing:
  - A password-style `Input` (masked) with show/hide toggle.
  - Helper text: "Paste the API key from your Postora account. Used to send all WhatsApp messages."
  - A small status badge: "Key set" / "No key" based on whether a value exists.
- The existing **Save settings** button persists it together with the rest of the settings (no separate save flow needed).
- Never read the key back into the UI in plaintext after first save — show only `••••••••` + last 4 chars, with an "Edit" action that clears the field for a new value. (Prevents shoulder-surfing the stored key.)

### 2. Backend — `supabase/functions/send-whatsapp/index.ts`
- After loading `settings` from `site_settings`, resolve the key as:
  ```
  const apiKey = (settings.api_key as string | undefined)?.trim()
              || Deno.env.get("POSTORA_WHATSAPP_API_KEY");
  ```
- Keep the existing "skipped: no_api_key" behavior if neither is present.
- No other logic changes.

### 3. Security
- `site_settings` already restricts `UPDATE`/`INSERT` to admins via RLS — good.
- BUT `SELECT` on `site_settings` is currently **public** (`Anyone can read site settings`). That means the saved Postora key would be readable by anyone hitting the table directly. We must fix this before storing a secret there.

Two options for the migration (will ask the user to pick — see Questions):

**Option A (simpler, recommended):** Tighten `site_settings` SELECT so the `whatsapp_integration` row is admin-only, while other settings rows stay public:
```sql
DROP POLICY "Anyone can read site settings" ON public.site_settings;
CREATE POLICY "Public can read non-secret settings" ON public.site_settings
  FOR SELECT USING (key NOT IN ('whatsapp_integration'));
CREATE POLICY "Admins can read all settings" ON public.site_settings
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
```
The edge function uses the service role, so it bypasses RLS — unaffected.

**Option B:** Store the key in a separate `secret_settings` table that is admin-only end-to-end. More work, cleaner separation.

### 4. Self-hosted migration
The plan creates **one SQL migration file** under `supabase/migrations/`. On self-hosted Supabase you run it with the existing `scripts/apply-self-hosted-migrations.sh` (already in repo). I'll also list the exact `psql` one-liner in the chat reply when implementing.

## Files touched
- `src/pages/admin/AdminWhatsApp.tsx` — add API-key card + state.
- `supabase/functions/send-whatsapp/index.ts` — prefer DB key over env.
- `supabase/migrations/<new>.sql` — restrict `site_settings` SELECT (Option A or B).

## Out of scope
- Rotating the env-var secret (no longer needed once the DB key works).
- Multi-account/workspace switching UI — current flow is one active key at a time.