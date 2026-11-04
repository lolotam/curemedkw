"""Real one-attempt core/SDK/crypto/RPC proof on the guarded disposable DB."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import uuid

from configuration_service_proof import ACTOR, RPCS, execute_rpc, fixture, literal, ROOT
from payment_owner_proof import apply_schema, manual_request

RPCS.update({
    "shipa_resolve_dispatch_binding": (("_shipment_id", "uuid"),),
    "shipa_check_integrity": (("_order_id", "uuid"), ("_review_snapshot", "jsonb")),
    "shipa_request_manual": (("_order_id", "uuid"), ("_request", "jsonb"), ("_actor_id", "uuid")),
    "shipa_read_shipment": (("_shipment_id", "uuid"), ("_actor_id", "uuid")),
    "shipa_prepare_submission": (("_shipment_id", "uuid"),),
    "shipa_begin_submission": (("_shipment_id", "uuid"), ("_attempt_token", "uuid"), ("_prepared", "jsonb")),
    "shipa_complete": (("_shipment_id", "uuid"), ("_attempt_token", "uuid"), ("_result", "jsonb")),
})


def seed_intents(container):
    # Synthetic test readiness only. Production enablement is still refused by
    # the settings RPC and Ministry shopping hold is never changed on a host.
    fixture.sql(container, "UPDATE public.integrations SET enabled=true WHERE provider='shipa'; "
        "INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{\"shoppingEnabled\":true,\"checkoutEnabled\":true}') "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value; "
        f"SET ROLE service_role; SELECT public.integration_activate_payment_retention('{ACTOR}'); RESET ROLE; "
        "INSERT INTO public.products(id,brand,name,price,sku,slug) VALUES "
        "('93000000-0000-4000-8000-000000000001','flexitol','Synthetic item',10,'submission-core-item','submission-core-item');", "postgres")
    bindings = {}
    for label in ("accepted", "uncertain", "lost_begin", "lost_complete", "manual_endpoint"):
        order = str(uuid.uuid5(uuid.NAMESPACE_URL, "curemed-submission-order:" + label))
        attempt = str(uuid.uuid5(uuid.NAMESPACE_URL, "curemed-submission-attempt:" + label))
        status = {"invoice_id": "core-invoice-" + label, "external_identifier": order,
            "transaction_payment_id": "core-payment-" + label, "invoice_status": "PAID", "transaction_status": "SUCCESS", "details": {}}
        fixture.sql(container, "INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method) "
            f"VALUES('{order}','Synthetic buyer','core@example.test','50000001','Hawally','Hawally','Synthetic buyer address',20,20,'pay_by_link'); "
            "INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) "
            f"VALUES('{attempt}','{order}',20,'core-key-{label}','core-invoice-{label}'); "
            "INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total) "
            f"VALUES('{order}','93000000-0000-4000-8000-000000000001','Synthetic item',2,10,20); "
            f"SET ROLE service_role; SELECT public.wa_record_provider_payment_outcome('{order}','{attempt}',{literal(json.dumps(status))},'signed_webhook');", "postgres")
        claim = json.loads(fixture.sql(container, f"SET ROLE service_role; SELECT public.wa_claim_pending_payment_verification('{order}','{ACTOR}')", "postgres").splitlines()[-1])
        verified = dict(status, amount_millis=20000, currency="KWD", pending_id=claim["id"], lease_token=claim["lease_token"])
        fixture.sql(container, f"SET ROLE service_role; SELECT public.wa_apply_verified_payment('{order}','{attempt}',{literal(json.dumps(verified))},'payment_sweep')", "postgres")
        requested = json.loads(fixture.sql(container, f"SET ROLE service_role; SELECT public.shipa_request_manual('{order}',"
            f"{literal(json.dumps(manual_request(container, order)))},'{ACTOR}')", "postgres").splitlines()[-1])
        integration = fixture.sql(container, "SELECT id FROM public.integrations WHERE provider='shipa'", "postgres")
        bindings[label] = {"shipmentId": requested["shipment_id"], "integrationId": integration, "environment": "sandbox"}
    return bindings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--deno", type=Path, required=True)
    parser.add_argument("--deno-cache", type=Path, required=True)
    args = parser.parse_args()
    state = json.loads(args.state.read_text(encoding="utf-8"))
    container = fixture.marker_guard(state)
    process = None
    calls = 0
    bindings = None
    try:
        # Restoration is permitted only by the existing local marker/image/
        # volume guard. No remote URL, production env or provider key is read.
        fixture.restore(args.state, args.baseline)
        apply_schema(container)
        fixture.sql(container, f"INSERT INTO auth.users(id,email) VALUES('{ACTOR}','core-proof@example.test'); "
            f"INSERT INTO public.user_roles(user_id,role) VALUES('{ACTOR}','admin')", "postgres")
        process = subprocess.Popen([str(args.deno), "run", "--config", str(ROOT / "deno.shipa.json"), "--frozen", "--cached-only",
            str(ROOT / "supabase/tests/shipa/verify_submission_service.ts")], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, encoding="utf-8", env=dict(os.environ, DENO_DIR=str(args.deno_cache)))
        receipt = None
        for line in process.stdout:
            request = json.loads(line)
            if request["kind"] == "complete":
                receipt = request["receipt"]
                break
            if calls >= 90:
                raise RuntimeError("Submission bridge exceeded its operation budget")
            calls += 1
            if request == {"kind": "seed"} and bindings is None:
                bindings = seed_intents(container)
                response = {"data": bindings, "error": None, "status": 200}
            elif request["kind"] == "rpc":
                response = execute_rpc(container, request)
            elif request == {"kind": "role", "actor": ACTOR}:
                rows = fixture.sql(container, "SET ROLE service_role; SELECT coalesce(jsonb_agg(jsonb_build_object('role',role)),'[]'::jsonb) "
                    f"FROM public.user_roles WHERE user_id='{ACTOR}' AND role='admin'", "postgres").splitlines()[-1]
                response = {"data": json.loads(rows), "error": None, "status": 200}
            elif request.get("kind") == "marker" and request.get("shipment") in {entry["shipmentId"] for entry in bindings.values()}:
                # Observer-only assertion as the guarded fixture owner. All application
                # RPC mutations still execute through the service-role bridge above.
                marked = fixture.sql(container, "SELECT state='submitting' AND attempt_count=1 "
                    "AND EXISTS(SELECT 1 FROM private.shipa_submission_markers marker WHERE marker.shipment_id=shipment.id) "
                    f"FROM public.shipments shipment WHERE id={literal(request['shipment'])}::uuid", "postgres").splitlines()[-1]
                response = {"data": marked == "t", "error": None, "status": 200}
            else:
                raise RuntimeError("Unexpected submission bridge operation")
            process.stdin.write(json.dumps(response) + "\n")
            process.stdin.flush()
        process.wait(timeout=15)
        if process.returncode or receipt is None or bindings is None:
            raise RuntimeError("Real submission bridge failed: " + process.stderr.read().strip())
        persisted = {}
        for label, binding in bindings.items():
            persisted[label] = json.loads(fixture.sql(container, "SELECT jsonb_build_object('state',state,'attempts',attempt_count,"
                "'markers',(SELECT count(*) FROM private.shipa_submission_markers WHERE shipment_id=shipment.id),"
                "'events',(SELECT count(*) FROM public.shipment_events WHERE shipment_id=shipment.id)) "
                f"FROM public.shipments shipment WHERE id='{binding['shipmentId']}'", "postgres"))
        for label, expected in (("accepted", "created"), ("uncertain", "unknown"), ("lost_begin", "submitting"), ("lost_complete", "created"), ("manual_endpoint", "created")):
            if persisted[label]["state"] != expected or persisted[label]["attempts"] != 1 or persisted[label]["markers"] != 1:
                raise RuntimeError("One-attempt marker/state invariant failed")
        reviews = int(fixture.sql(container, "SELECT count(*) FROM private.shipa_reviews "
            f"WHERE shipment_id='{bindings['accepted']['shipmentId']}'", "postgres"))
        if reviews != 2:
            raise RuntimeError("Lost manual-review response duplicated or lost the committed review audit")
        print(json.dumps({"submission_service_bridge": receipt, "operations": calls, "persisted": persisted,
            "accepted_review_audits": reviews, "production_access": False}))
    finally:
        if process is not None:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()
        fixture.marker_guard(state)
        fixture.restore(args.state, args.baseline)
        apply_schema(container)


if __name__ == "__main__":
    main()
