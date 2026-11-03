# Shipa V2 adapter manager validation

The MiniMax M3.1-Flash protocol slice was reviewed and assembled on the Shipa feature branch. It provides request validation/building, fixed-origin bounded transport, response normalization and fake-boundary tests. It does not implement database, routes, shipment scheduling or UI.

## Runtime and checks

Official portable Deno2.5.6, V8 14.0.365.5-rusty, TypeScript5.9.2. Windows archive SHA256 `1327356cd63e23d0da7d11d5f5ca6b45902b1b62ee2debd4fbbd0aad2aab9786` matched the plan's publisher checksum before extraction. A stalled PowerShell download was retried with bounded curl; both eventually completed. No PATH/global tool or production runtime changed.

Strict Deno checking through the test graph, focused lint and54tests passed. The Deno config and generated lock pin the actual assertion dependency. Tests received no network, environment or secret-file permissions. This is changed-area verification; full project verification remains the pre-PR gate.

The original51tests had one incorrect assertion: a reference containing a dot/underscore was expected to fail despite the declared allowed character vocabulary. The assertion was corrected against the captured adapter contract. Manager-added regressions then reproduced unbounded uncooperative fetch/body/cancellation and null-draft exceptions. Review also found unknown field names echoed in errors and unknown nested coordinate fields allowed through. Fixed errors omit unknown names; malformed drafts fail locally; coordinate fields are explicit; reference/phone checks reject trailing newlines; the deadline races the whole request, and cancellation does not hold the response open. Provider creation failures remain uncertain and cannot authorize automatic rebooking.

The builder now carries optional server-owned pickup instructions into the documented origin options.specialInstructions field. A behavioral test proves preservation of collection/call instructions with destination collection amount still zero. Instructions do not prove a carrier-enforced pickup window.

## Real read-only sandbox proof

Manager ran the actual adapter against the sandbox using a protected private credential file, with Deno permission restricted to that file and sandbox host. Only normalized nonsecret metadata was printed. Health returnedOK; countryKWT returnedKuwait and118cities. Directory candidates includedHawally, matching CureMed's supplied pickup city, and Maidan Hawalli. No mutation or live-host request was made. This is actual parser/transport evidence, separate from faked tests.

Warehouse contact, corrected phone, office address, Next Day selection and09:00–16:00Kuwait call-before-collection instruction remain deployment inputs, outside generic adapter defaults. Merchant service entitlement and pickup scheduling still require account proof; the directory alone does not prove them.

## Activity audit and limits

Audited219child timeline items. Six allowed new files were delivered; the existing five settings/domain files were not part of its change. The child used directory-scoped searches and glob despite its file-only/no-inventory instruction. No shell/network/other-checkout access or outside-allowlist write was observed. Do not describe the run as sandbox-enforced or fully instruction-compliant.

The examples-free seven-path21-schema JSON capture omits multi-reference history; the original YAML includes it, but the current adapter deliberately uses single-order history only. Other ambiguities remain documented in the contract capture. No idempotency, negative-lookup consistency, billing, rate-limit or remote exactly-once guarantee was invented.

Production migration/merge approvals, ministry hold, payment evidence protection, final assembled review and runtime routing gates remain unchanged. No application deployment, SQL migration, shipment, webhook registration or customer communication occurred in this slice.
