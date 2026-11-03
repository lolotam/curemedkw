# Strict payment evidence and bounded recovery — manager validation

Migration `20261103001400_integration_payment_verification.sql` implements the SQL recovery lease, list, strict evidence and resolution APIs over the single first-success owner. Runtime handlers, the actual GET sweep, recipient expansion and shipment queue/submission remain separate unfinished dependencies. No full SQL freeze or feature acceptance is claimed.

## Evidence

The first actual-role fixture caught a PL/pgSQL ambiguity between the pending-row variable and an UPDATE alias. That query had compiled but failed when called. The alias was corrected; the real SQL fixture then passed. No check was disabled or weakened.

The expanded primary-checkout proof (manager exec session `12759`, observed exit 0) applied all seven assembled migrations twice with absent and pre-existing `private` schemas under adversarial default privileges. Existing schema owners/ACL/defaults/constraints/triggers/policies remained unchanged. Five retained WhatsApp SQL files, the owner fixture and the new strict-evidence fixture passed on each pass.

The tests exercise actual service/browser role boundaries, exact evidence/event/receipt identity, legacy ownership without a second send/event, durable pending expansion, invalid GET identity/amount/currency/status, changed current total, invented/stale lease, deterministic mismatch without automatic retry, 45-second leases, exact 1/5/15/30/60-minute backoff and six-attempt exhaustion. A stale success records evidence but skips the late notification and holds automatic shipping. A signed paid order remains paid after strict verification failure.

The harness additionally observed concurrent pending GET workers claim different rows while the first transaction remained open (`SKIP LOCKED`), then forced two strict completions of one lease to contend on the order lock. Both returned the same evidence/event; the persisted result was one evidence row, one Shipa payment receipt and resolved pending state. Callback/webhook first-success contention remained green. All fixtures are synthetic; no provider HTTP or live operation ran.

Schema fingerprints from that run:

- Absent `private`: `8020913272465be53b47716d55d98e2db23ad082739ff575c0d3cd2f1bd320d9`
- Existing `private`: `7142566c28a58e52c4ba5f1f2ff4d2bf682bd935a3b43f3806601a026721bd0f`

After the run, the complete strict input envelope received the same 8 KiB bound as its status projection; equivalent parentheses around generated UUID expressions and JSON construction of a synthetic invalid token also avoid the repository's literal-secret-pattern hook. Targeted SQL was re-applied and re-run before commit. The guarded fixture was restored to the assembled schema with activation flags false. No full suite/build was run.

## Remaining gates

Manager proof is not an independent SA rerun, Astra review, production concurrency guarantee or a native payment journey. In particular the unwired app does not yet enforce this RPC contract: initial callback identity discovery, unresolved invoice tuples, terminal review recovery and the payment-owned scheduler still need consumers and contract tests. Evidence's Shipa `enqueued` policy is not a shipment queue receipt. Runtime enqueue/begin must recompute current integrity and respect account/configuration/hold gates. No retry of unknown provider creation is authorized.

Ministry shopping hold, separate production application SQL/merge approvals and live payment/shipment/message gates remain. No CureMed production database or application was changed in this slice.
