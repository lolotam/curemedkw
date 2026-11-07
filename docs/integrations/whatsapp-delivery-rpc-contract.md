# WhatsApp reservation and completion

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Claim reserves a durable attempt and account slot after eligibility checks. Its successful result is internal and includes the encrypted credential, recipient and body; never expose it to a browser. Finish is fenced by the attempt token. Possible or accepted dispatch cannot gain an ordinary retry through a visible-state reset. HTTP belongs outside these database transactions.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
wa_expire_delivery_leases(p_job_id uuid DEFAULT NULL) -> jsonb
wa_claim_delivery(p_job_id uuid,p_actor_kind text, p_request_deadline timestamptz,p_actor_id uuid DEFAULT NULL) -> jsonb
wa_finish_delivery(p_job_id uuid,p_attempt_token uuid,p_outcome jsonb) -> jsonb
```

## Source

- [supabase/migrations/20261103002200_whatsapp_delivery_claim.sql](../../supabase/migrations/20261103002200_whatsapp_delivery_claim.sql)
- [supabase/migrations/20261103002300_whatsapp_delivery_finish.sql](../../supabase/migrations/20261103002300_whatsapp_delivery_finish.sql)
