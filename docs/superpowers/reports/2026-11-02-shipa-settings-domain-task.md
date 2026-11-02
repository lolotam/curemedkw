# Shipa settings and mocked dispatch domain — implementation report

Date: 2026-11-02
Task: first authorized settings / mock-domain slice (`.curemed-manager-task.md`)
Implementer lane: MiniMax M3.1-Flash, file-only (no shell, MCP, web, Git, installs, tests or builds)

## Status

**DONE_WITH_CONCERNS**

Four implementation files and this report were written inside the prepared worktree. The
concerns are listed at the end: nothing was executed, so the new tests and the type
surface are unverified by execution, and several domain assumptions were made where the
brief left a decision open.

Preflight attestation was read first: `.curemed-manager-preflight.json` reported
`ok: true`, `remainingEnvironmentFiles: 0`, `worktreePath` matching this checkout. No
checkout preparation, no `.env*`, no `.git`, no secrets and no files outside this
checkout were touched.

## Changed files

| File | Purpose |
| --- | --- |
| `src/lib/shipaSettings.ts` | Task A — settings contracts, Zod validation, draft transitions, activation readiness |
| `src/lib/shipaSettings.test.ts` | Task A — Vitest cases (authored, not run) |
| `src/lib/shipaDispatchPolicy.ts` | Task B — advisory dispatch policy over mocked snapshots |
| `src/lib/shipaDispatchPolicy.test.ts` | Task B — Vitest cases (authored, not run) |
| `docs/superpowers/reports/2026-11-02-shipa-settings-domain-task.md` | This report |

No other file was created, edited or deleted. No commit was made.

## Exported surface

`src/lib/shipaSettings.ts`

- Constants / types: `DISPATCH_MODES`, `DispatchMode`, `SHIPA_ENVIRONMENTS`,
  `ShipaEnvironment`, `KUWAIT_COUNTRY_CODE`, `SCHEDULER_HEARTBEAT_MAX_AGE_MS`,
  `REQUIRED_SHIPA_ORIGIN_ADDRESS_FIELDS`.
- Zod schemas: `dispatchModeSchema`, `shipaEnvironmentSchema`, `shipaOriginAddressSchema`,
  `shipaOriginSchema`, `shipaParcelDimensionsSchema`, `shipaParcelDraftSchema`,
  `shipaCredentialMetadataSchema`, `shipaPublicSettingsSchema`, `shipaSettingsSchema`.
- Inferred types: `ShipaOriginAddress`, `ShipaOrigin`, `ShipaParcelDimensions`,
  `ShipaParcelDraft`, `ShipaCredentialMetadata`, `ShipaPublicSettings`, `ShipaSettings`.
- Defaults: `createDefaultShipaOriginAddress`, `createDefaultShipaOrigin`,
  `createDefaultShipaParcelDraft`, `createDefaultShipaCredentialMetadata`,
  `createDefaultShipaPublicSettings`, `createDefaultShipaSettings`,
  `DEFAULT_SHIPA_SETTINGS`, `DEFAULT_SHIPA_PUBLIC_SETTINGS`.
- Parsing: `parseShipaSettings`, `parseShipaPublicSettings`, `ShipaSettingsParseResult<T>`,
  `ShipaSettingsParseErrorCode` (`forbidden_credential_field` | `invalid_settings`).
- Draft transitions: `shipaPublicSettingsForEnvironment`, `withShipaEnvironment`,
  `withShipaDispatchMode`, `applyShipaPublicSettingsPatch`, `withShipaEnvironmentSettings`,
  plus the patch shapes `ShipaOriginAddressPatch`, `ShipaOriginPatch`, `ShipaParcelPatch`,
  `ShipaPublicSettingsPatch`.
- Activation readiness: `evaluateShipaActivationReadiness`,
  `ShipaActivationReadinessInput`, `ShipaActivationReadiness`, `ShipaActivationIssue`,
  `ShipaActivationIssueCode`, `missingShipaOriginAddressFields`.

`src/lib/shipaDispatchPolicy.ts`

- Types: `DispatchSource`, `DispatchShipmentState`, `DispatchOrderStatus`,
  `DispatchPaymentStatus`, `DispatchPaymentReceipt`, `DispatchOrderState`,
  `DispatchRetryState`, `DispatchValidationEvidence`, `DispatchReviewEvidence`,
  `DispatchPolicyInput`, `DispatchPolicyReasonCode`, `DispatchPolicyDecision`.
- Function: `evaluateDispatchPolicy(input) -> { allowed, requiresStaffReview, reasons }`.

## Decisions and assumptions

1. **Address shape.** The origin uses `countryCode` fixed to `"KW"` plus
   `governorate`, `area`, `block`, `street`, `building`, `addressLine`, matching the field
   names of the existing order address snapshot in `src/lib/db.ts`. The brief's list does
   not include `city`, so `city` is not modelled; the order snapshot still has it.
2. **Required activation data.** Activation readiness requires origin contact name,
   contact phone, the five required address fields (`governorate`, `area`, `block`,
   `street`, `building`) and a parcel weight. `addressLine` and parcel dimensions are
   optional at activation time.
3. **`serviceCode` is not activation-blocking.** It stays a free string because the
   confirmed vendor contract defines valid service codes; requiring one now would
   fabricate a vendor constraint. It becomes required when the contract is captured.
4. **Dimensions are optional in the draft** but, when supplied, all three values must be
   positive finite numbers. Weight is `null` until entered — never a fabricated non-zero
   default and never derived from product quantities.
5. **Credential rejection.** Every schema is `.strict()`, so unknown fields are rejected
   rather than preserved. In addition, a deep scan rejects credential-like key names
   (`apiKey`, `token`, `ciphertext`, `apiUrl`, `webhookSecret`, …) with the dedicated
   stable code `forbidden_credential_field` and the offending dotted paths.
6. **Credential presence is an explicit input flag.** `evaluateShipaActivationReadiness`
   takes `activeEnvironmentCredentialPresent` as a server-provided fact rather than
   deriving it from the draft's cached metadata.
7. **Scheduler freshness.** A heartbeat is fresh when its age is at most three minutes
   (the boundary instant is accepted); older is `scheduler_heartbeat_stale`, a future
   timestamp is `scheduler_heartbeat_in_future`, an unreadable one is
   `scheduler_heartbeat_invalid`, and an absent one is `scheduler_heartbeat_missing`.
   The scheduler is required only in `automatic_after_payment`; manual mode never
   consults it.
8. **Switching never resets.** `withShipaEnvironment` and `withShipaDispatchMode` copy the
   draft and change one field, keeping both environment drafts and all nested values
   intact. `withShipaEnvironmentSettings` patches exactly one environment. Revision is
   not bumped here — bumping belongs to the real save path, which this task does not
   implement.
9. **Patch semantics.** `undefined` in a patch means "not supplied" and keeps the stored
   value; an explicit `null` clears a nullable field.
10. **`needs_review` as an input shipment state blocks** the submission and is reported
    as `shipment_needs_review` with `requiresStaffReview: true`, matching the reviewed
    plan's "resolve explicitly, no scheduled create".
11. **Pricing acknowledgement.** An automatic source with `pricingStatus` of `mismatch`
    or `not_checked` always requires staff review. A manual source may proceed only with
    an acknowledged exception whose `reviewedInputFingerprint` equals the current input
    fingerprint. A missing receipt, a mismatched payment identity/amount or invalid
    required delivery data are hard blocks and are never overridden by that
    acknowledgement.
12. **Retry.** A retry proceeds only when it is documented retryable, `retryAt` has
    arrived (evaluated against an injected `now`), the budget is not exhausted, and the
    original review still matches the current input. The function is pure, so it never
    resets `retryCount`; the input object is returned untouched.
13. **`unknown` never becomes retryable.** An unknown outcome stays blocked
    (`shipment_outcome_unknown`) regardless of elapsed time, even with a due retry.
14. **Advisory only.** Both modules are pure and side-effect free. No provider call, no
    queue, no enqueue, no persistence, no historical backfill. Selecting
    `automatic_after_payment` generates nothing. The report and module headers state
    that real authorization, verified receipt binding and atomicity belong to the future
    server-only verified-payment RPCs and dispatch worker.

## Tests authored — NOT RUN

No test, typecheck, lint or build was executed. The manager runs the checks.

`src/lib/shipaSettings.test.ts` (authored, not run)

- Safe defaults: disabled / sandbox / `manual_after_packing` / revision 0, parcel count
  1, unset weight `null`, country fixed to Kuwait, credential absent.
- Both dispatch modes and both environments accepted; unknown dispatch mode, unknown
  environment, negative revision and fractional revision rejected.
- Mode switch and environment switch preserve the other environment's settings and
  nested values; patching one environment leaves the other untouched; nested merge does
  not drop sibling values.
- Credential-like fields (`apiKey`, `api_key`, `token`, `ciphertext`, `apiUrl`,
  `webhookSecret`) and a nested credential-like field rejected with
  `forbidden_credential_field`; an unknown benign field rejected with
  `invalid_settings`; the rejected value never appears in the result.
- Kuwait address and one-parcel rules: foreign country rejected, parcel count ≠ 1
  rejected, negative / zero / infinite / NaN weight rejected, partial dimensions
  rejected, non-positive dimension rejected, unset weight and dimensions accepted.
- Disabled incomplete draft parses cleanly while activation reports the missing
  requirements (provider reference, adapter, credential, contact, phone, address,
  weight).
- Missing provider reference and missing adapter each block activation; sandbox/live
  credential metadata stays separate and the active environment is the one checked.
- Scheduler heartbeat: fresh, exactly-at-boundary, stale, future, missing, unreadable,
  and manual mode independent of the scheduler.

`src/lib/shipaDispatchPolicy.test.ts` (authored, not run)

- Eligible paid order with a verified receipt is allowed.
- Blocked: disabled integration, ministry hold, environment mismatch, unpaid, refunded,
  partially refunded, cancelled, missing receipt, unverified receipt, mismatched payment
  identity.
- Source-aware eligibility: automatic outside automatic mode blocked; automatic in
  automatic mode allowed; manual allowed in both modes.
- Existing `submitting` / `created` / `unknown` deny another create; a recorded prior
  dispatch decision fixture denies it too; unknown stays blocked even with a due retry;
  `needs_review` returns to staff; a definitively rejected shipment may be attempted
  again.
- Pricing mismatch: automatic requires staff review; manual without an acknowledgement
  is denied; a stale reviewed-input fingerprint is denied; a matching acknowledgement is
  allowed; a valid acknowledgement still cannot override a missing receipt, a mismatched
  payment identity, or invalid required delivery data.
- Retry: not due denied; due allowed; non-retryable failure denied; exhausted budget
  denied; the retry budget is untouched by an allowed retry; a due retry whose original
  review no longer matches is denied.

The fixtures are deliberately free of credential-shaped material: only short obvious
dummies such as `"dummy"` and `"https://example.invalid"` appear.

## Limitations

- **No persistence.** Nothing is saved, loaded or migrated; there is no settings table,
  no migration, no SQL and no admin UI. The drafts are local contracts only, and no
  caller may claim a save occurred.
- **No provider adapter and no vendor mapping.** The account's Shipa V2 reference is
  unavailable, so there is no endpoint, auth header, request payload, service enum,
  address code, unit conversion or webhook schema anywhere in these files. Nothing here
  can be translated into a Shipa request, and no booking was created or simulated.
- **No real authorization.** The dispatch decision is advisory client-domain logic over
  mocked snapshots. It is not a trust boundary, not a payment proof and not an
  idempotency guarantee. Server-only verified receipts/RPCs must own real authorization
  and atomicity.
- **No scheduler, worker, queue or enqueue.** The scheduler heartbeat is an injected
  input fact, not a probe; the policy never schedules, queues or submits anything.
- **No checkout, pricing or payment mutation.** Order pricing, fees and payments are
  untouched; the pricing evidence is an input flag, and no repricing happens.
- **Verification status.** The new tests were not executed, and no typecheck, lint or
  build was run in this lane. Manager checks are still outstanding.

## Concerns for the manager

1. **Nothing was executed.** The four files are unverified by any run. The manager's
   targeted Vitest, typecheck and lint runs are the first real evidence.
2. **Required-address and service-code assumptions.** Items 2 and 3 above are judgement
   calls where the brief did not fix the rule. If activation should require
   `addressLine`, dimensions or a service code, the constants and the readiness function
   need one line each.
3. **Origin address without `city`.** The repository's order address has a `city` field;
   the brief's field list did not include it, so it is absent here.
4. **`needs_review` input state blocks.** The brief listed `submitting`, `unknown` and
   `created` as blocking states. `needs_review` was added as a blocking, staff-review
   state on the strength of the reviewed plan's rule that it means "no scheduled create".
5. **Reason-code vocabulary.** The stable codes in both modules are new names chosen for
   this slice. The server RPCs and the future UI will have to speak the same vocabulary.
6. **`countryCode` is `"KW"`.** The existing repository region data uses the same
   two-letter code, but the Shipa address coding is unverified, so this is an internal
   value only and must not be forwarded to the vendor as-is.

## Manager validation checkpoint — 2026-11-02

The implementer's report above is preserved as its original, unexecuted submission.
The manager reviewed all five files and made two small corrections: added the missing
`apiurl` and `secretkey` forbidden-key names, and made the automatic-heartbeat test
fixture forward its overrides. The first focused run reproduced six failures out of
82 tests; four failures were caused by that fixture ignoring its arguments.

Only these five authorized files were copied into the existing manager checkout to
use its installed dependencies. The worker checkout remains intact, including its
intentional environment-file sanitation; those deletions are not feature changes.

Checks ran serially in the manager checkout:

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` — passed.
- `node node_modules/eslint/bin/eslint.js src/lib/shipaSettings.ts src/lib/shipaSettings.test.ts src/lib/shipaDispatchPolicy.ts src/lib/shipaDispatchPolicy.test.ts` — passed.
- `node node_modules/vitest/vitest.mjs run src/lib/shipaSettings.test.ts src/lib/shipaDispatchPolicy.test.ts --maxWorkers=1 --no-file-parallelism` — 82 tests passed in two files.

An earlier temporary detached-checkout typecheck configuration could not resolve the
installed dependency declarations correctly; its errors are not valid feature proof.
The successful check above uses the project's unchanged configuration and dependencies.

Independent Astra review is next. In particular, inspect retry review fingerprints
when pricing is accepted, recovery from `needs_review`, and whether validation errors
can echo rejected input. These are unresolved review questions, not accepted behavior.
The full suite is reserved for immediately before the PR under SA-15. No provider
adapter, SQL, persistence, UI, production action, PR or merge is included in this slice.

## Astra review and manager corrections — 2026-11-02

The requested `gpt-6-astra` reviewer at medium reasoning effort completed its read-only
review and required five corrections before accepting this advisory slice. It made no
edits and ran no checks. The manager accepted all five findings, traced each to the
reviewed plan, and corrected them locally without another design round or implementer.
This section supersedes the affected assumptions and verification claims above.

1. **Independent approval evidence.** `approvedInputFingerprint` now represents explicit
   staff approval of the delivery input, independently of the pricing exception. Every
   manual-source submission requires it to match the nonblank current fingerprint.
   Retries additionally require `originalInputFingerprint` to match the current input,
   even when prices are accepted and even for automatic-source retries. Matching empty
   or whitespace-only fingerprints never establish approval.
2. **Retry-count semantics.** `retryCount` is the already-scheduled retry number, incremented
   before execution by the eventual result owner. Numbers 1, 2 and 3 may execute; a fourth
   retry is exhausted. Zero, negative, fractional and non-finite counts are invalid.
   The caller-configurable `maxRetries` field was removed. These helpers never increment
   or reset the count. This models at most four total sends, including the initial one;
   it does not implement the persistent result/scheduling transition.
3. **Safe parse failures.** Both parsers now share one implementation returning fixed
   messages. Neither raw Zod messages nor rejected values, field names or ancestor
   paths are returned. The previous `forbiddenPaths` result field was removed because
   even an ancestor name can contain sensitive text. Strict schemas still reject all
   unknown fields; the forbidden-key scan only classifies the failure.
4. **Explicit review recovery.** `needs_review` remains blocked. Before calling this
   submission policy, the real caller must perform the plan's explicit server-owned
   staff resolution/adoption into `queued`, set source to `manual`, and retain approval
   of the current input and any permitted pricing exception. The sequence regression
   represents those snapshots without claiming this advisory helper performs or
   authorizes the transition. Changed inputs invalidate the approval. Unresolved
   scheduled work remains blocked.
5. **Readiness validates drafts.** Activation now uses the existing full settings parser
   before assessing completeness. A typed patch with invalid weight or dimensions
   returns `invalid_settings` and cannot yield `ready=true`. Incomplete but structurally
   valid disabled drafts still parse and report their missing activation requirements.

The `source` contract now explicitly means persisted shipment source, not the execution
actor. A scheduler may execute a reviewed manual-source retry in either dispatch mode.
The normalized payment contract now explicitly requires `paid`; project failures must
be normalized by the eventual integration caller. Vendor-dependent address/service
requirements remain deferred; no vendor fields were invented.

Regression-first check: 111 focused tests were present before the corrections, and 34
failed against the preceding implementation. After the corrections, all 111 passed in
the same two files using the original project Vitest configuration and a single worker.
The updated project frontend typecheck and changed-file ESLint both passed. The manager
will stage only these five authorized files for a local feature-branch checkpoint.
No second Astra pass has been run; these
are manager-verified corrections to the completed review, not a new reviewer approval.
