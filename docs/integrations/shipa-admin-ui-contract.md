# Shipa configuration UI

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

The configuration page uses the session-owned runtime client to invoke shipa-admin. Settings, credential and diagnosis actions are separate. The hook keeps sandbox/live drafts, revision/conflict state and transient credential text. The browser does not supply administrator identity or provider endpoint authority. Readiness presentation does not replace server validation.

## Source

- [src/pages/admin/AdminIntegrations.tsx](../../src/pages/admin/AdminIntegrations.tsx)
- [src/hooks/useShipaConfiguration.ts](../../src/hooks/useShipaConfiguration.ts)
- [src/lib/shipaAdmin.ts](../../src/lib/shipaAdmin.ts)
