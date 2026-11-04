# Shipa one-attempt runtime core checkpoint

MiniMax authored eight new files from `b7529113842bffa61bbfea456128528d32127328`; the manager audited actual activity/diff, integrated the files, split an oversized parser and corrected boundary/mapping findings. The core now composes the real credential loader, native crypto, strict SQL parsers, adapter builder, HTTP client and completion store. No endpoint/scheduler/UI/activation/native booking is completed by this checkpoint.

## Provenance and control deviations

Independent preflight confirmed `t3/284fe8ff`, exact baseline/path, implementation-ready, environment files/pattern counts zero and eight new paths only. Completion status was consumed once after its notification; all activity through 264 was read with no remaining page. No worker shell/check/Git/network/SQL/provider operation or existing source edit was observed. Retained environment deletions/preflight/task remain unstaged in the child.

Contrary to its final report, the worker used 35 file-search operations and one glob returning 40 Shipa filenames under its functions directory, despite explicit no-search/no-inventory instructions. Read-only access to its own generated copies of allowlisted source was permitted; searching those copies was not. Two typo-path reads at positions 70 and 93 returned ENOENT; it continued despite stop-on-error. The first typo named a nonexistent `waleed_Mohandex` path; the second misspelled an output-copy filename. No unrelated file contents were observed. These are recorded control violations, not a hard sandbox or full-compliance claim. SA received the concrete deviation packet; no model/lane/resource change was inferred.

The response module was 795 lines, exceeding the worker's 500-line cap. The manager split structural draft/JSON/primitives/SQLSTATE mapping into `shipa-submission-validation.ts`, retaining the public exports. Final response/helper modules are below 500 lines. This extra path is manager-authored, not an undisclosed ninth worker file.

## Observed execution and fixes

- Initial frozen graph check and 42 focused worker tests passed. Manager regressions then exposed acceptance of impossible created/null-reference, out-of-range counters and malformed timestamp summaries. Parsers now enforce the persisted state/reference/count invariants and finite timestamps. Matching refusal shipment and strict internal binding/begin/credential field checks were added; tainted authority fields fail before RPC/key work. Final focused suite has 46 tests (23 store, 23 dispatcher), with real modules and only SDK/fetch boundaries faked.
- Worker identified a real SQL/adapter mismatch: SQL emitted a blank pickup instruction/options member while the adapter requires an optional instruction to be absent or nonblank. The new actual SQL mapping regression failed before migration 021 and passed after it. Meaningful text is preserved, blank/ASCII whitespace/Unicode whitespace normalize to absence, and prepaid KWT wire fields remain unchanged.
- Final assembled manager proof session 47423 exited 0: fourteen migrations twice with private absent/existing, adversarial grants and baseline parity, seven WhatsApp plus ten Shipa SQL fixtures per application. Existing real payment/GET/intent/begin/key/unbound/expansion correction races stayed green. Actual SQL preparation passed the strict production parser and real adapter builder; four additional optional-instruction mapping variants also matched. Those variants are mapping-only and deliberately grant no fresh begin fingerprint. The strict bridge change initially hit TS2345 in the test assertion's generic type inference; explicit unknown comparison preserved real structural equality and the frozen check passed.
- New guarded `submission_service_proof.py`/`verify_submission_service.ts` passed with 26 operations. The real SDK, core, crypto and actual service-role SQL performed four cases with synthetic provider POST only: accepted became created, provider 503 became unknown, response lost after committed begin issued zero POST and retained submitting, response lost after committed completion reported persistence_uncertain while SQL retained created. Every case had one marker/attempt; replay obtained no second creation authority. Calls verified one begin RPC per case. The remote boundary is synthetic; this is not a native booking, deployed routing or HTTP caller-auth proof.

Final targeted formatting/lint passed across eleven TypeScript files, and the frozen production/test/bridge graph passed. The real core bridge passed again against final input guards and parsed fixture bindings; no full frontend/application suite was run at this checkpoint.

The first commit was refused by the secret hook for a field-to-field attempt identifier and two synthetic UUID fixtures. Shorter descriptive aliases retained identical values/behavior; the hook was not bypassed and focused checks were rerun.

The local submission bridge explicitly seeds synthetic enabled/open settings after storing an encrypted key, because production activation remains intentionally unavailable. It supplies synthetic service attestations through the actual signed-status/strict-evidence/paid receipt and reviewed manual intent functions, not direct receipt inserts. No HMAC or native provider attestation is proved. This fixture setup is not enablement/readiness/service entitlement evidence. The marker guard restricts restoration to the disposable local exact-image fixture; final assembled schema is restored with activation flags false.

Reproduce that focused real core bridge only against the guarded disposable fixture:

```powershell
python -X utf8 supabase/tests/shipa/submission_service_proof.py --state <guarded-state.json> --baseline <verified-schema-only-baseline.sql> --deno <verified-deno-2.5.6.exe> --deno-cache <private-deno-cache>
```

## Outstanding acceptance

Endpoint/item/scheduler deadlines, verified caller/binding provenance, eligible candidate selection, heartbeat/activation, expiry/status/reconciliation and admin UI remain unfinished. Pre-begin local validation returns a fixed response without inventing a pre-marker completion transition. All begin failures remain conservatively uncertain when authority cannot be proven received. Final assembled lock review/Astra and separately approved schema/app delivery/rollback/native proofs remain required.

No full SQL freeze, PR/push/merge, production application migration/deployment, provider shipment, live payment, QR or customer message occurred. Evidence is manager-owned, not SA reruns or final feature acceptance. Ministry hold, shared trusted payment owner, sticky unknown/no blind retry, unchanged checkout prices and all separate gates remain.
