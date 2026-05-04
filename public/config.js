// Runtime configuration. Overridden per environment by mounting/baking
// a different config.js into the Docker image at /usr/share/nginx/html/config.js.
//
// Leave values empty to fall back to Vite build-time env vars
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).
//
// For the self-hosted Dokploy deployment, replace with:
//   window.__APP_CONFIG__ = {
//     SUPABASE_URL: "https://supabase.curemedkw.com",
//     SUPABASE_ANON_KEY: "<self-hosted anon key>"
//   };
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};
