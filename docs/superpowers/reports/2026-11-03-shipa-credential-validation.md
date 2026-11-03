# Shipa credential primitive validation

2026-11-03. MiniMax M3.1-Flash delivered four new files; manager reviewed and ran real WebCrypto tests with the approved portable Deno2.5.6 runtime.

Initial checking found generic typed-array BufferSource incompatibilities and a missing error-class import. Fixed return types to reflect actual ArrayBuffer allocations and restored the test import. All35original crypto/contract tests then passed. Manager regression reproduced a raw TypeError for an invalid injected key; explicit CryptoKey validation now returns a closed error. Encoded tuple lengths are bounded before base64 allocation. Removed a constant-only arithmetic test in favor of a UUID newline rejection case.

All90Shipa backend tests passed, with strict checking, formatting and focused lint. Tests had no network/env/file permissions and use actual AES-GCM. No SQL, storage or runtime credential-loading correctness is claimed by these tests. AAD is the fixed UTF8JSONtuple [1, lowercaseIntegrationUUID, 'shipa', environment, keyVersion]; it intentionally excludes settings revision. The injected keyring is caller-owned.

Audited80child activity items. Observed reads/writes stayed within allowed files; no shell/search/glob/network/other-checkout operation was observed. Restrictions were instructed, not sandbox-enforced. Four files assembled into primary; existing untracked material and all earlier work preserved. No production mutation, shipment, message, migration or merge.

Next required dependency is actual settings/credential SQL plus real-role fixture and concurrency proof before any store or route consumes it. Remaining shipment/payment/UI/runtime work is unfinished.