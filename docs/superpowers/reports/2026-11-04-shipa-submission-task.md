# Shipa durable submission begin — manager validation

This checkpoint implements SQL preparation and atomic begin with a private permanent marker. It is not a working provider worker, deployed integration, full SQL freeze or operational release acceptance.

## Observed gates

Manager proof `16491` exited 0. Nine migrations were applied twice for both absent and pre-existing private schemas under adversarial grants. Pre-existing owners/ACL/defaults/constraints/triggers/policies remained unchanged. Five WhatsApp plus seven Shipa SQL fixture files ran on each pass. Existing payment/GET/intent contention tests stayed green; two real begin transactions contended, producing one authorized worker, one refusal, one marker and one attempt.

The same proof passed actual SQL preparation through the real Shipa adapter using verified Deno 2.5.6, frozen lock and cached-only execution. SQL and adapter wire payloads matched, with KWT countries and prepaid collection 0. This is a contract proof with synthetic data, not a native API call or key-validity proof.

Schema fingerprints from the final assembled run:

- Absent private: `5a6bd83df05dcd1087dfcf73c52124f21b8b74e5807ffd0eb49691dca7dced9f`
- Existing private: `d2650b21fc25009820ccaa746a7cbae14164e943e466712d5f2e5c83d3a3798c`

The actual-role submission fixture additionally covers preparation without send authority, forged payload, loaded-key fingerprint mismatch despite reused revision, changed order/catalog/items, correct/stale explicit price review, hold, loss after marker, lease expiry, late acceptance, token reuse and a private marker surviving reset public display/attempt fields. No repeated begin authorizes HTTP.

Initial migration compilation caught a CASE-expression parsing ambiguity; parentheses fixed it. The first fixture caught a test variable/column `label` ambiguity; the loop variable was renamed. Assertions were retained. After the assembled run, strict prepared metadata validation was completed and its focused actual SQL apply/fixture passed again. The Deno bridge was formatted, then frozen typecheck and focused lint passed. An initial `deno check --cached-only` invocation was rejected because that flag is not accepted by check in 2.5.6; command help was inspected and the supported frozen check then passed. The bridge's actual `deno run --cached-only` remains valid and passed. No failed gate is being reported as green.

The guarded fixture was restored to assembled schema with activation flags false. No full suite/build, provider creation, private key decryption, production app SQL/deploy/merge, live payment, QR or WhatsApp send was performed. Receipts are manager evidence, not independent SA reruns or final Astra review.

The commit hook refused the new concurrency fixture's two synthetic UUID variables named `*_token`. They were renamed to their winning/competing attempt meaning without changing values or bypassing the hook. No actual credential was staged.

## Boundaries

The exact service credential-read root gains a SQL fingerprint alongside its unchanged encrypted envelope/revision/rotation fields. New loaders must bind the key actually loaded to that fingerprint and revision. No plaintext is stored or returned by SQL. Current setting enablement remains refused, and test setup enabled only synthetic local configuration.

The private marker is permanent in this release because no native no-creation retry guarantee is established. It is not a general retry or cancellation API. Final runtime tests must prove call counts across crash/lost-response paths and correct service/scheduler authentication; SQL authority counts alone do not prove provider exactly-once semantics. Final lock review, credential mutation/readiness, payment writer/recovery wiring, status/reconciliation, UI, WhatsApp runtime/expansion and approved deployment/rollback journeys remain. The broad coupon SHARE cost and no-HTTP transaction rule remain explicit.
