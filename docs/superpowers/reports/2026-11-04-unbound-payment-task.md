# Signed success before invoice mapping — local checkpoint

Migration 01800 adds service-only canonical attempt discovery and unbound signed-success persistence/binding. It reuses the existing pending tuple and first-success payment owner for both integrations. No HTTP handler, payment provider request or production writer is changed here. Non-success missing-mapping event logging and HTTP responses still need application wiring.

## Observed proof

Final guarded assembled proof process `87646` exited 0. Eleven migrations applied twice with private absent and pre-existing, adversarial grants and unchanged baseline schema/owner/ACL/default/constraint/trigger/policy snapshots. Five WhatsApp plus nine Shipa actual-role fixture files ran per pass. All prior owner/GET/strict/intent/begin/key contention and SQL-to-real-Deno payload bridge receipts stayed green.

The new forced overlap held a real unbound-binding transaction open while an authenticated-callback-shaped service status call waited on the same order. It produced one first-success owner, one pending tuple and one changed payment result; replay preserved first-seen time and spent zero GET attempts. Local role fixtures cover absent mapping, duplicate identity, unsigned amount rejection, failed-status refusal, foreign/guest-copied and ambiguous invoice mappings, bound strict evidence, old review/age retention, a second successful attempt remaining superseded, and browser privilege denial.

Final snapshot fingerprints:

- Private absent: `5b4b12a5cac14883291f542aa1c26ce503a0e960c8d337b2641ae8b5d6f7c029`.
- Private existing: `ce15c6eda2db9cf1ba054fad03ed1fc6a3e65b816c2dc960c5528c3a7e184421`.

The initial focused fixture attempted a strict GET claim before its preserved 30-second due time, receiving `verification_lease_required`. The fixture now explicitly advances its synthetic due time rather than resetting production history. A later regression first failed because an old unbound success could create a fresh legacy notification window. The first-success capture now makes an already 24-hour-old trusted tuple manual-only and skips legacy expansion with `notification_stale`; the paid status still commits. Focused reapply/test and final assembled proof passed. Earlier process `78056` passed before that final stale-window correction and is not the final acceptance receipt.

Focused clean-code, test and documentation guards checked identity provenance, unchanged owner selection, no age/budget reset, terminal-state behavior, no external calls and lock order. The fixture ended restored to assembled schema with activation flags false. These are manager execution receipts, not native signature/HTTP proof, SA reruns, final Astra review or production concurrency guarantees.

## Remaining integration work

Wire verified webhook/callback/admin handlers, checked payment-event logs and exact five-minute responses, initial callback/global GET budgeting, terminal review recovery and the actual payment-owned sweep. Protected invoice writers and quiesced activation remain required. Shipa and WhatsApp runtime/dispatch/status/UI, final assembled journeys/Astra and approved deployment/rollback remain incomplete. No provider booking, payment, QR, customer message, production application SQL or merge was performed. Ministry hold, separate live/production gates, checkout prices and shared payment ownership remain unchanged.

The independent MiniMax configuration-services slice completed during this checkpoint. Its eight new files are copied into the primary checkout for manager validation but are outside this SQL checkpoint. Its frozen Deno graph check has passed; full source/test audit and focused test/lint validation remain pending, so no service acceptance is claimed here.
