// Browser-side access to the order-email templates.
//
// This re-exports the SAME module the edge function uses
// (`supabase/functions/_shared/order-email-template.ts`) rather than keeping a
// second copy. That module is deliberately dependency-free, so it bundles
// cleanly here, and the admin preview is guaranteed byte-identical to what
// `send-order-email` actually sends — a duplicated copy would silently drift.
//
// The edge function still gets its own copy on the server because
// `deploy_functions()` copies the whole `_shared` directory.
export * from "../../supabase/functions/_shared/order-email-template.ts";
