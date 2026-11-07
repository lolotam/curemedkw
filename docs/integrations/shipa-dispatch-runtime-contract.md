# Shipa dispatch runtime

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

The dispatcher composes preparation, exact loaded-credential validation, durable begin, one provider create and completion persistence. Uncertain results do not trigger a second create. The worker handler authenticates before work, attempts pending-payment verification and processes at most three selected candidates. Only scheduler-source authorization records scheduler health. Runtime keys use server-owned version 1 and lazy key loading.

## Source

- [supabase/functions/_shared/shipa-dispatch.ts](../../supabase/functions/_shared/shipa-dispatch.ts)
- [supabase/functions/shipa-dispatch/handler.ts](../../supabase/functions/shipa-dispatch/handler.ts)
- [supabase/functions/_shared/shipa-runtime.ts](../../supabase/functions/_shared/shipa-runtime.ts)
