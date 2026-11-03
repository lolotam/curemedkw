"""Shared-payment proof on the marker-guarded local disposable database only."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "supabase/tests/whatsapp"))
import fixture
from core_proof import SNAPSHOT

MIGRATIONS = tuple(ROOT / "supabase/migrations" / name for name in (
    "20261103000100_whatsapp_core.sql", "20261103000200_whatsapp_transactions.sql",
    "20261103001000_shipa_settings.sql", "20261103001100_shipa_dispatch_state.sql",
    "20261103001200_shipa_integrity.sql", "20261103001300_integration_payment_owner.sql",
    "20261103001400_integration_payment_verification.sql", "20261103001500_shipa_intents.sql"))
TESTS = tuple(ROOT / "supabase/tests/whatsapp" / name for name in (
    "privileges.sql", "transactions.sql", "settings.sql", "credentials.sql", "activation.sql")) + (
        ROOT / "supabase/tests/shipa/settings.sql", ROOT / "supabase/tests/shipa/dispatch_state.sql",
        ROOT / "supabase/tests/shipa/integrity.sql", ROOT / "supabase/tests/shipa/payment_owner.sql",
        ROOT / "supabase/tests/shipa/payment_verification.sql", ROOT / "supabase/tests/shipa/intents.sql")


def open_psql(container):
    return subprocess.Popen(["docker", "exec", "-i", "-e",
        "PGPASSWORD=" + fixture.FIXTURE_DATABASE_AUTH, container, "psql", "-X",
        "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8")


def write_sql(process, query):
    process.stdin.write(query + "\n")
    process.stdin.flush()


def close_processes(processes):
    for process in processes:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        for stream in (process.stdin, process.stdout, process.stderr):
            if not stream.closed:
                stream.close()


def concurrent_callback_and_webhook(container):
    actor = "83000000-0000-4000-8000-000000000001"
    order = "83000000-0000-4000-8000-000000000002"
    attempt = "83000000-0000-4000-8000-000000000003"
    fixture.sql(container, f"INSERT INTO auth.users(id,email) VALUES ('{actor}','owner-race@example.test'); "
        f"INSERT INTO public.user_roles(user_id,role) VALUES ('{actor}','admin'); "
        f"SET ROLE service_role; SELECT public.integration_activate_payment_retention('{actor}'); RESET ROLE; "
        "INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,subtotal,total,payment_method) "
        f"VALUES ('{order}','Synthetic','race@example.test','50000001',20,20,'pay_by_link'); "
        "INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) "
        f"VALUES ('{attempt}','{order}',20,'owner-race','owner-race-invoice');", "postgres")
    attestation = json.dumps({"invoice_id": "owner-race-invoice", "external_identifier": order,
        "transaction_payment_id": "owner-race-payment", "invoice_status": "PAID",
        "transaction_status": "SUCCESS", "details": {}})
    call = f"SELECT public.wa_record_provider_payment_outcome('{order}','{attempt}',"
    webhook = call + f"'{attestation}','signed_webhook');"
    callback = call + f"'{attestation}'::jsonb||'{{\"amount_millis\":20000,\"currency\":\"KWD\"}}','verified_callback');"
    first, second = open_psql(container), open_psql(container)
    try:
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; "
            "DO $$BEGIN PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE; "
            "PERFORM 1 FROM public.integrations WHERE provider='shipa' FOR SHARE; "
            f"PERFORM 1 FROM public.orders WHERE id='{order}' FOR UPDATE; END$$; SELECT 'locked';")
        if first.stdout.readline().strip() != "locked":
            raise RuntimeError("First payment writer did not acquire its lock")
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; "
            "SET LOCAL application_name='integration-owner-callback'; SET LOCAL ROLE service_role; " + callback + " COMMIT;")
        write_sql(first, "DO $wait$ DECLARE seen boolean:=false; BEGIN FOR i IN 1..150 LOOP "
            "PERFORM pg_stat_clear_snapshot(); IF EXISTS(SELECT 1 FROM pg_stat_activity "
            "WHERE application_name='integration-owner-callback' AND wait_event_type='Lock') "
            "THEN seen:=true; EXIT; END IF; PERFORM pg_sleep(0.02); END LOOP; "
            "IF NOT seen THEN RAISE EXCEPTION 'callback_did_not_contend'; END IF; END $wait$; "
            "SET LOCAL ROLE service_role; " + webhook + " COMMIT;")
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Contended payment transaction failed: " + process.stderr.read().strip())
        winner, replay = (json.loads(process.stdout.read().strip()) for process in (first, second))
        if winner["changed"] is not True or replay["changed"] is not False or not winner["outcome_id"]:
            raise RuntimeError("Contended first success was not one change and one replay")
        if winner["outcome_id"] != replay["outcome_id"] or winner["owner_snapshot"] != replay["owner_snapshot"]:
            raise RuntimeError("Callback and webhook selected different immutable owners")
        counts = fixture.sql(container, f"SELECT jsonb_build_array("
            f"(SELECT count(*) FROM private.wa_payment_outcomes WHERE order_id='{order}'),"
            f"(SELECT count(*) FROM private.wa_pending_payment_verifications WHERE order_id='{order}'),"
            f"(SELECT count(*) FROM private.wa_payment_evidence WHERE order_id='{order}'),"
            f"(SELECT payment_status FROM public.orders WHERE id='{order}'))", "postgres")
        if json.loads(counts) != [1, 1, 0, "paid"]:
            raise RuntimeError("Contended writes duplicated ownership/recovery or invented strict evidence")
    finally:
        close_processes((first, second))


def apply_schema(container):
    for migration in MIGRATIONS:
        fixture.sql(container, migration.read_text(encoding="utf-8"), "postgres")


def concurrent_verification_claims(container):
    order = "83000000-0000-4000-8000-000000000012"
    attempt = "83000000-0000-4000-8000-000000000013"
    worker = "83000000-0000-4000-8000-000000000014"
    attestation = json.dumps({"invoice_id": "claim-race-invoice", "external_identifier": order,
        "transaction_payment_id": "claim-race-payment", "invoice_status": "PAID",
        "transaction_status": "SUCCESS", "details": {}})
    fixture.sql(container, "INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method) "
        f"VALUES ('{order}','Synthetic','claim@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link'); "
        "INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) "
        f"VALUES ('{attempt}','{order}',20,'claim-race','claim-race-invoice'); "
        "INSERT INTO public.products(id,brand,name,price,sku,slug) VALUES "
        "('83000000-0000-4000-8000-000000000015','flexitol','Race item',10,'claim-race-item','claim-race-item'); "
        "INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total) "
        f"VALUES ('{order}','83000000-0000-4000-8000-000000000015','Race item',2,10,20); "
        f"SET ROLE service_role; SELECT public.wa_record_provider_payment_outcome('{order}','{attempt}',"
        f"'{attestation}','signed_webhook');", "postgres")
    first, second = open_psql(container), open_psql(container)
    try:
        # The first claim remains uncommitted while the other worker must skip it.
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role; "
            f"SELECT public.wa_claim_pending_payment_verification('{order}','{worker}');")
        first_claim = json.loads(first.stdout.readline())
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role; "
            f"SELECT public.wa_claim_pending_payment_verification(NULL,'{worker}'); COMMIT;")
        second_claim = json.loads(second.stdout.readline())
        if first_claim["id"] == second_claim["id"] or first_claim["lease_token"] == second_claim["lease_token"]:
            raise RuntimeError("Concurrent GET workers claimed the same pending identity/token")
        if first_claim["attempt_count"] != 1 or second_claim["attempt_count"] != 1:
            raise RuntimeError("Concurrent GET claims consumed an unexpected attempt budget")
        write_sql(first, "COMMIT;")
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Concurrent GET claim did not skip the locked row: " + process.stderr.read().strip())
    finally:
        close_processes((first, second))
    return first_claim, attestation


def concurrent_strict_completion(container, claim, attestation):
    verified = json.loads(attestation)
    verified.update({"amount_millis": 20000, "currency": "KWD", "pending_id": claim["id"], "lease_token": claim["lease_token"]})
    complete = "SET LOCAL ROLE service_role; SELECT public.wa_apply_verified_payment("
    complete += f"'{claim['order_id']}','{claim['attempt_id']}','{json.dumps(verified)}','payment_sweep'); COMMIT;"
    first, second = open_psql(container), open_psql(container)
    try:
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; DO $$BEGIN "
            "PERFORM 1 FROM public.whatsapp_settings WHERE singleton FOR SHARE; "
            "PERFORM 1 FROM public.integrations WHERE provider='shipa' FOR SHARE; "
            f"PERFORM 1 FROM public.orders WHERE id='{claim['order_id']}' FOR UPDATE; END$$; SELECT 'locked';")
        if first.stdout.readline().strip() != "locked":
            raise RuntimeError("Strict evidence worker did not acquire its order lock")
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; "
            "SET LOCAL application_name='integration-strict-completion'; " + complete)
        write_sql(first, "DO $wait$ DECLARE seen boolean:=false; BEGIN FOR i IN 1..150 LOOP "
            "PERFORM pg_stat_clear_snapshot(); IF EXISTS(SELECT 1 FROM pg_stat_activity "
            "WHERE application_name='integration-strict-completion' AND wait_event_type='Lock') "
            "THEN seen:=true; EXIT; END IF; PERFORM pg_sleep(0.02); END LOOP; "
            "IF NOT seen THEN RAISE EXCEPTION 'strict_completion_did_not_contend'; END IF; END $wait$; " + complete)
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Concurrent strict completion failed: " + process.stderr.read().strip())
        winner, replay = (json.loads(process.stdout.read().strip()) for process in (first, second))
        if winner != replay or not winner["evidence_id"]:
            raise RuntimeError("Concurrent strict completions produced different evidence/events")
        counts = fixture.sql(container, f"SELECT jsonb_build_array("
            f"(SELECT count(*) FROM private.wa_payment_evidence WHERE order_id='{claim['order_id']}'),"
            f"(SELECT count(*) FROM private.order_payment_verifications WHERE order_id='{claim['order_id']}'),"
            f"(SELECT state FROM private.wa_pending_payment_verifications WHERE id='{claim['id']}'))", "postgres")
        if json.loads(counts) != [1, 1, "resolved"]:
            raise RuntimeError("Concurrent strict completion duplicated evidence or the Shipa receipt")
    finally:
        close_processes((first, second))


def concurrent_manual_adoption(container, claim):
    fixture.sql(container, "UPDATE public.integrations SET enabled=true,dispatch_mode='automatic_after_payment',revision=revision+1,"
        "configuration=jsonb_set(configuration,'{sandbox}',"
        "'{\"appId\":null,\"serviceCode\":\"Next Day\",\"autoConfirm\":false,\"pickupInstructions\":\"Synthetic call first\","
        "\"origin\":{\"contactName\":\"Synthetic office\",\"contactPhone\":\"+96550000002\",\"address\":{\"countryCode\":\"KW\","
        "\"governorate\":\"Hawally\",\"area\":\"Hawally\",\"block\":\"\",\"street\":\"\",\"building\":\"\",\"addressLine\":\"Synthetic office\"}},"
        "\"parcel\":{\"count\":1,\"weightKg\":1,\"dimensionsCm\":{\"lengthCm\":10,\"widthCm\":8,\"heightCm\":6}}}') WHERE provider='shipa'; "
        "INSERT INTO public.site_settings(key,value) VALUES('ecommerce_mode','{\"shoppingEnabled\":true,\"checkoutEnabled\":true}') "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value;", "postgres")
    request = manual_request(container, claim["order_id"])
    complete = "SET LOCAL ROLE service_role; SELECT public.shipa_request_manual("
    complete += f"'{claim['order_id']}','{json.dumps(request)}','83000000-0000-4000-8000-000000000001'); COMMIT;"
    first, second = open_psql(container), open_psql(container)
    try:
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; DO $$BEGIN "
            "PERFORM 1 FROM public.site_settings WHERE key='ecommerce_mode' FOR SHARE; "
            "PERFORM 1 FROM public.integrations WHERE provider='shipa' FOR SHARE; "
            f"PERFORM 1 FROM public.orders WHERE id='{claim['order_id']}' FOR UPDATE; END$$; SELECT 'locked';")
        if first.stdout.readline().strip() != "locked":
            raise RuntimeError("Manual intent worker did not acquire its order lock")
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL application_name='shipa-manual-race'; " + complete)
        write_sql(first, observe_lock("shipa-manual-race") + complete)
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Concurrent manual intent failed: " + process.stderr.read().strip())
        winner, replay = (json.loads(process.stdout.read().strip()) for process in (first, second))
        if winner["shipment_id"] != replay["shipment_id"] or winner["changed"] is not True or replay["changed"] is not False:
            raise RuntimeError("Concurrent staff clicks recreated an intent or its review")
        if fixture.sql(container, f"SELECT count(*) FROM private.shipa_reviews WHERE shipment_id='{winner['shipment_id']}'", "postgres") != "1":
            raise RuntimeError("Concurrent manual replay duplicated the review audit")
    finally:
        close_processes((first, second))


def manual_request(container, order):
    integrity = json.loads(fixture.sql(container,
        f"SELECT public.shipa_check_integrity('{order}','{{\"environment\":\"sandbox\"}}')", "postgres"))
    revision = int(fixture.sql(container, "SELECT revision FROM public.integrations WHERE provider='shipa'", "postgres"))
    return {"environment": "sandbox", "overrides": {}, "expectedSettingsRevision": revision,
        "expectedInputFingerprint": integrity["input_fingerprint"], "reviewReason": "Synthetic packed confirmation",
        "acknowledgePricing": False, "packedConfirmed": True}


def observe_lock(application):
    return "DO $wait$ DECLARE seen boolean:=false; BEGIN FOR i IN 1..150 LOOP " \
        "PERFORM pg_stat_clear_snapshot(); IF EXISTS(SELECT 1 FROM pg_stat_activity " \
        f"WHERE application_name='{application}' AND wait_event_type='Lock') " \
        "THEN seen:=true; EXIT; END IF; PERFORM pg_sleep(0.02); END LOOP; " \
        "IF NOT seen THEN RAISE EXCEPTION 'intent_writer_did_not_contend'; END IF; END $wait$; "


def concurrent_automatic_and_manual(container):
    order = "83000000-0000-4000-8000-000000000022"
    attempt = "83000000-0000-4000-8000-000000000023"
    status = {"invoice_id": "automatic-race-invoice", "external_identifier": order,
        "transaction_payment_id": "automatic-race-payment", "invoice_status": "PAID", "transaction_status": "SUCCESS", "details": {}}
    fixture.sql(container, "INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method) "
        f"VALUES ('{order}','Synthetic','automatic@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link'); "
        "INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) "
        f"VALUES ('{attempt}','{order}',20,'automatic-intent-race','automatic-race-invoice'); "
        "INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total) "
        f"VALUES ('{order}','83000000-0000-4000-8000-000000000015','Race item',2,10,20); "
        f"SET ROLE service_role; SELECT public.wa_record_provider_payment_outcome('{order}','{attempt}','{json.dumps(status)}','signed_webhook');", "postgres")
    claim_output = fixture.sql(container, "SET ROLE service_role; SELECT public.wa_claim_pending_payment_verification("
        f"'{order}','83000000-0000-4000-8000-000000000014');", "postgres")
    if not claim_output.startswith("SET\n"):
        raise RuntimeError("Claim fixture did not observe its service-role command result")
    claim = json.loads(claim_output.split("\n", 1)[1])
    verified = status | {"amount_millis": 20000, "currency": "KWD", "pending_id": claim["id"], "lease_token": claim["lease_token"]}
    request = manual_request(container, order)
    first, second = open_psql(container), open_psql(container)
    try:
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role; "
            f"SELECT public.wa_apply_verified_payment('{order}','{attempt}','{json.dumps(verified)}','payment_sweep');")
        strict_receipt = json.loads(first.stdout.readline())
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL application_name='shipa-auto-manual-race'; "
            "SET LOCAL ROLE service_role; SELECT public.shipa_request_manual("
            f"'{order}','{json.dumps(request)}','83000000-0000-4000-8000-000000000001'); COMMIT;")
        # Keep service-role mutation proof, then use the fixture session owner
        # only to observe another session's lock metadata.
        write_sql(first, "RESET ROLE; " + observe_lock("shipa-auto-manual-race") + "COMMIT;")
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Automatic/manual intent race failed: " + process.stderr.read().strip())
        adopted = json.loads(second.stdout.read().strip())
        persisted = json.loads(fixture.sql(container, f"SELECT jsonb_build_object('count',count(*),'id',min(id::text),"
            f"'manual',bool_and(source='manual'),'unattempted',bool_and(attempt_count=0 AND attempt_token IS NULL)) "
            f"FROM public.shipments WHERE order_id='{order}'", "postgres"))
        if not strict_receipt["evidence_id"] or persisted != {"count": 1, "id": adopted["shipment_id"], "manual": True, "unattempted": True}:
            raise RuntimeError("Automatic/manual overlap lost the single unattempted intent identity")
    finally:
        close_processes((first, second))


def prove_schema_case(container, state, baseline, preexisting_private):
    fixture.restore(state, baseline)
    if preexisting_private:
        fixture.sql(container, "CREATE SCHEMA private AUTHORIZATION postgres; "
            "CREATE TABLE private.unrelated_owner_sentinel(marker text); "
            "GRANT USAGE ON SCHEMA private TO anon; "
            "GRANT SELECT ON private.unrelated_owner_sentinel TO anon; "
            "ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT ALL ON TABLES TO anon,authenticated;", "postgres")
    fixture.sql(container, "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;", "postgres")
    identities = fixture.sql(container, "SELECT string_agg(c.oid::text,',') FROM pg_class c "
        "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','S','v') "
        "AND n.nspname IN ('public','auth','storage','private')", "postgres")
    snapshot = SNAPSHOT.replace("__OIDS__", identities).replace("__PRIVATE_EXISTED__",
        "true" if preexisting_private else "false")
    before = fixture.sql(container, snapshot, "postgres")
    for _ in range(2):
        apply_schema(container)
        if fixture.sql(container, snapshot, "postgres") != before:
            raise RuntimeError("Schema phase changed baseline owners, ACLs, defaults, constraints, triggers or policies")
        for test in TESTS:
            fixture.sql(container, test.read_text(encoding="utf-8"), "postgres")
    concurrent_callback_and_webhook(container)
    claim, attestation = concurrent_verification_claims(container)
    concurrent_strict_completion(container, claim, attestation)
    concurrent_manual_adoption(container, claim)
    concurrent_automatic_and_manual(container)
    return {"preexisting_private": preexisting_private, "schema_applications": 2,
        "baseline_unchanged": True, "schema_fingerprint": hashlib.sha256(before.encode()).hexdigest(),
        "actual_role_fixtures": True, "forced_callback_webhook_contention": True,
        "one_first_success_one_replay": True, "concurrent_get_claims_skip_locked": True,
        "concurrent_strict_completion_one_evidence_one_shipa_receipt": True,
        "concurrent_manual_clicks_single_intent_review": True,
        "concurrent_automatic_manual_single_identity": True, "production_access": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    args = parser.parse_args()
    state = json.loads(args.state.read_text(encoding="utf-8"))
    container = fixture.marker_guard(state)
    try:
        receipts = [prove_schema_case(container, args.state, args.baseline, existing) for existing in (False, True)]
        print(json.dumps({"shared_payment_owner_proof": receipts}))
    finally:
        fixture.restore(args.state, args.baseline)
        apply_schema(container)


if __name__ == "__main__":
    main()
