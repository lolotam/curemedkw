// Runtime configuration for the Supabase backend.
//
// Read first by src/integrations/supabase/clientRuntime.ts. Falls back to
// VITE_SUPABASE_* env vars only if the values below are empty.
//
// Why hardcoded here:
//   - Lovable blocks VITE_* in Build Secrets ("not allowed").
//   - The .env file is auto-managed by Lovable and rewrites to Lovable Cloud.
//   - public/config.js is committed and served at /config.js, so it's the
//     only place we can override the backend in the Lovable preview.
//
// The ANON key is a public JWT (the `anon` role) — safe to commit. Real
// security comes from RLS policies on the database.
//
// On Dokploy production, docker/start-nginx.sh OVERWRITES this file at
// container start using RUNTIME_SUPABASE_URL / RUNTIME_SUPABASE_ANON_KEY,
// so the same build can also point at staging without rebuilding.
window.__APP_CONFIG__ = {
  SUPABASE_URL: "https://supabase.curemedkw.com",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzc4MjU5NzMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6ImFub24iLCJpc3MiOiJzdXBhYmFzZSJ9.lBYJu-yyK1dHScm8_vL9wBZvxEArzQjncOtC44w1-_Q",
};
