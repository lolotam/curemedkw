// Shipa delivery settings — browser-safe re-exports of the shared contract.
//
// The settings contract now lives in the Supabase Edge shared folder so the
// browser and the server share exactly one vocabulary:
//
//   supabase/functions/_shared/shipa-settings.ts
//     the schemas, types, defaults, draft transitions and completeness rules
//   supabase/functions/_shared/shipa-settings-validation.ts
//     the strict parsers and the activation readiness assessment
//
// This file only re-exports them. There is deliberately no second schema
// here: a duplicate definition would let the admin UI accept a shape the
// Edge layer refuses, or the other way round.
//
// The shared modules stay browser-safe: they import nothing but `zod`, use no
// React, no Supabase client, no Deno API, no storage and no network access.

export * from "../../supabase/functions/_shared/shipa-settings";
export * from "../../supabase/functions/_shared/shipa-settings-validation";
