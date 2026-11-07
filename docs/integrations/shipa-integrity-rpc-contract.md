# Shipa integrity review

Verified against main `1919045a6a0970138962d5b62b17a190a7197133`. This describes repository behavior, not deployed state or live-provider acceptance.

Integrity compares stored order lines, catalog prices, coupon arithmetic, totals and delivery inputs. The snapshot selects an environment and optional destination/parcel overrides. Overrides do not rewrite the order. The result contains accepted, reasons, input_fingerprint and settings_revision. Acceptance is a diagnostic, not payment evidence or submission authority.

These wrappers are service-only. An actor UUID is not HTTP authentication; administrator callers must derive it from a verified session. Internal credential-bearing results must stay on the server.

```text
shipa_check_integrity(_order_id uuid,_review_snapshot jsonb) -> jsonb
```

## Source

- [supabase/migrations/20261103001200_shipa_integrity.sql](../../supabase/migrations/20261103001200_shipa_integrity.sql)
