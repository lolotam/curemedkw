"""Shared-payment proof on the marker-guarded local disposable database only."""
import argparse
import hashlib
import json
import os
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
    "20261103001400_integration_payment_verification.sql", "20261103001500_shipa_intents.sql",
    "20261103001600_shipa_submission.sql", "20261103001700_shipa_credential_readiness.sql",
    "20261103001800_integration_unbound_payments.sql"))
TESTS = tuple(ROOT / "supabase/tests/whatsapp" / name for name in (
    "privileges.sql", "transactions.sql", "settings.sql", "credentials.sql", "activation.sql")) + (
        ROOT / "supabase/tests/shipa/settings.sql", ROOT / "supabase/tests/shipa/dispatch_state.sql",
        ROOT / "supabase/tests/shipa/integrity.sql", ROOT / "supabase/tests/shipa/payment_owner.sql",
        ROOT / "supabase/tests/shipa/payment_verification.sql", ROOT / "supabase/tests/shipa/intents.sql",
        ROOT / "supabase/tests/shipa/submission.sql", ROOT / "supabase/tests/shipa/credential_readiness.sql",
        ROOT / "supabase/tests/shipa/unbound_payments.sql")


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
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value; "
        "INSERT INTO private.integration_credentials(integration_id,environment,provider,key_version,nonce,ciphertext,revision,updated_by) "
        "SELECT id,'sandbox','shipa',1,encode(decode(repeat('ab',12),'hex'),'base64'),encode(decode(repeat('cd',17),'hex'),'base64'),1,"
        "'83000000-0000-4000-8000-000000000001' FROM public.integrations;", "postgres")
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
    return order


def prepared_submission(container, order):
    shipment = fixture.sql(container, f"SELECT id FROM public.shipments WHERE order_id='{order}'", "postgres")
    output = fixture.sql(container, f"SET ROLE service_role; SELECT public.shipa_prepare_submission('{shipment}')", "postgres")
    if not output.startswith("SET\n"):
        raise RuntimeError("Preparation fixture did not observe its service-role command result")
    preparation = json.loads(output.split("\n", 1)[1])
    if preparation.get("ready") is not True:
        raise RuntimeError("Synthetic reviewed shipment was not ready for submission")
    return preparation


def sql_payload_matches_adapter(preparation, deno, cache):
    completed = subprocess.run([str(deno), "run", "--config", str(ROOT / "deno.shipa.json"),
        "--frozen", "--cached-only", str(ROOT / "supabase/tests/shipa/verify_sql_submission_payload.ts")],
        input=json.dumps(preparation), text=True, encoding="utf-8", capture_output=True,
        env=dict(os.environ, DENO_DIR=str(cache)), timeout=30)
    if completed.returncode:
        raise RuntimeError("Actual SQL-to-Shipa-builder contract failed: " + completed.stderr.strip())
    if completed.stdout.strip() != "SQL preparation matches the actual Shipa request builder":
        raise RuntimeError("SQL-to-adapter proof did not return its expected receipt")


def concurrent_begin_submission(container, preparation):
    fields = ("settings_revision", "input_fingerprint", "credential_revision", "credential_fingerprint", "payload", "payload_hash")
    prepared = json.dumps({field: preparation[field] for field in fields})
    winning_attempt = "83000000-0000-4000-8000-000000000031"
    competing_attempt = "83000000-0000-4000-8000-000000000032"
    shipment = preparation["shipment_id"]
    first, second = open_psql(container), open_psql(container)
    try:
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role; "
            f"SELECT public.shipa_begin_submission('{shipment}','{winning_attempt}','{prepared}');")
        winner = json.loads(first.stdout.readline())
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL application_name='shipa-begin-race'; "
            f"SET LOCAL ROLE service_role; SELECT public.shipa_begin_submission('{shipment}','{competing_attempt}','{prepared}'); COMMIT;")
        write_sql(first, "RESET ROLE; " + observe_lock("shipa-begin-race") + "COMMIT;")
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Concurrent begin failed: " + process.stderr.read().strip())
        loser = json.loads(second.stdout.read().strip())
        if winner["ready"] is not True or loser["ready"] is not False or winner["attempt_token"] != winning_attempt:
            raise RuntimeError("Two workers obtained provider-creation authority")
        persisted = json.loads(fixture.sql(container, f"SELECT jsonb_build_array("
            f"(SELECT count(*) FROM private.shipa_submission_markers WHERE shipment_id='{shipment}'),"
            f"(SELECT attempt_count FROM public.shipments WHERE id='{shipment}'),"
            f"(SELECT state FROM public.shipments WHERE id='{shipment}'))", "postgres"))
        if persisted != [1, 1, "submitting"]:
            raise RuntimeError("Begin did not atomically retain exactly one attempt/marker")
    finally:
        close_processes((first, second))


def concurrent_begin_and_credential_mutation(container, previous_preparation):
    order = "83000000-0000-4000-8000-000000000042"
    attempt = "83000000-0000-4000-8000-000000000043"
    actor = "83000000-0000-4000-8000-000000000001"
    # Resolve the preceding real begin before seeding this race. Otherwise an
    # older unresolved marker could make a broken new-begin guard appear safe.
    fixture.sql(container, "SET ROLE service_role; DO $resolved$ DECLARE safe jsonb; patch jsonb; envelope jsonb; BEGIN "
        f"IF public.shipa_complete('{previous_preparation['shipment_id']}','83000000-0000-4000-8000-000000000031',"
        "'{\"outcome\":\"accepted\",\"shipaRef\":\"SB-resolved-before-rotation\",\"orderStatus\":\"Created\"}')->>'state'<>'created' "
        "THEN RAISE EXCEPTION 'previous_begin_not_resolved'; END IF; "
        f"safe:=public.shipa_read_settings('{actor}'); patch:=((safe->'settings')-'revision')||'{{\"enabled\":false}}'; "
        "patch:=jsonb_set(jsonb_set(patch,'{sandbox}',(patch->'sandbox')-'credential'),'{live}',(patch->'live')-'credential'); "
        "envelope:=public.shipa_read_credential((safe->>'integration_id')::uuid,'sandbox')->'envelope'; "
        f"PERFORM public.shipa_save_settings((safe#>>'{{settings,revision}}')::integer,patch,"
        f"jsonb_build_object('mode','replace','environment','sandbox','envelope',envelope),'{actor}'); END $resolved$; "
        "RESET ROLE; UPDATE public.integrations SET enabled=true WHERE provider='shipa';", "postgres")
    if fixture.sql(container, "SELECT count(*) FROM public.shipments shipment WHERE state<>'created' "
            "AND private.shipa_has_possible_dispatch(shipment)", "postgres") != "0":
        raise RuntimeError("Older unresolved dispatch evidence contaminated the new-begin race")
    status = json.dumps({"invoice_id": "rotation-race-invoice", "external_identifier": order,
        "transaction_payment_id": "rotation-race-payment", "invoice_status": "PAID", "transaction_status": "SUCCESS", "details": {}})
    fixture.sql(container, "INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method) "
        f"VALUES ('{order}','Synthetic','rotation@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link'); "
        "INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key,invoice_id) "
        f"VALUES ('{attempt}','{order}',20,'rotation-intent-race','rotation-race-invoice'); "
        "INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total) "
        f"VALUES ('{order}','83000000-0000-4000-8000-000000000015','Race item',2,10,20); "
        "SET ROLE service_role; DO $seed$ DECLARE claim jsonb; BEGIN "
        f"PERFORM public.wa_record_provider_payment_outcome('{order}','{attempt}','{status}','signed_webhook'); "
        f"claim:=public.wa_claim_pending_payment_verification('{order}','83000000-0000-4000-8000-000000000014'); "
        f"PERFORM public.wa_apply_verified_payment('{order}','{attempt}','{status}'::jsonb||jsonb_build_object("
        "'amount_millis',20000,'currency','KWD','pending_id',claim->'id','lease_token',claim->'lease_token'),'payment_sweep'); END $seed$;", "postgres")
    preparation = prepared_submission(container, order)
    fields = ("settings_revision", "input_fingerprint", "credential_revision", "credential_fingerprint", "payload", "payload_hash")
    prepared = json.dumps({field: preparation[field] for field in fields})
    shipment = preparation["shipment_id"]
    first, second = open_psql(container), open_psql(container)
    try:
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role; "
            f"SELECT public.shipa_begin_submission('{shipment}','83000000-0000-4000-8000-000000000044','{prepared}');")
        started = json.loads(first.stdout.readline())
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL application_name='shipa-credential-race'; "
            "SET LOCAL ROLE service_role; DO $rotation$ DECLARE patch jsonb; safe jsonb; BEGIN "
            f"safe:=public.shipa_read_settings('{actor}'); patch:=((safe->'settings')-'revision')||'{{\"enabled\":false}}'; "
            "patch:=jsonb_set(jsonb_set(patch,'{sandbox}',(patch->'sandbox')-'credential'),'{live}',(patch->'live')-'credential'); "
            f"BEGIN PERFORM public.shipa_save_settings((safe#>>'{{settings,revision}}')::integer,patch,"
            f"'{{\"mode\":\"remove\",\"environment\":\"sandbox\"}}','{actor}'); "
            "RAISE EXCEPTION 'rotation_crossed_active_begin'; EXCEPTION WHEN object_not_in_prerequisite_state THEN "
            "IF SQLERRM<>'shipa_credential_in_use' THEN RAISE; END IF; END; END $rotation$; SELECT 'rotation_refused'; COMMIT;")
        write_sql(first, "RESET ROLE; " + observe_lock("shipa-credential-race") + "COMMIT;")
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Begin/key-mutation race failed: " + process.stderr.read().strip())
        if started["ready"] is not True or second.stdout.read().strip() != "rotation_refused":
            raise RuntimeError("Credential mutation did not wait and refuse the committed submission")
        persisted = json.loads(fixture.sql(container, "SELECT public.shipa_read_credential("
            f"'{preparation['integration_id']}','sandbox')", "postgres"))
        if persisted["credential_revision"] != preparation["credential_revision"] or persisted["credential_fingerprint"] != preparation["credential_fingerprint"]:
            raise RuntimeError("Contended credential mutation changed the key used by a submission")
    finally:
        close_processes((first, second))


def concurrent_unbound_and_callback(container):
    order = "83000000-0000-4000-8000-000000000052"
    attempt = "83000000-0000-4000-8000-000000000053"
    status = json.dumps({"invoice_id": "unbound-race-invoice", "external_identifier": order,
        "transaction_payment_id": "unbound-race-payment", "invoice_status": "PAID", "transaction_status": "SUCCESS", "details": {}})
    fixture.sql(container, "INSERT INTO public.orders(id,customer_name,customer_email,customer_phone,governorate,city,address_line,subtotal,total,payment_method) "
        f"VALUES ('{order}','Synthetic','unbound-race@example.test','50000001','Hawally','Hawally','Synthetic street',20,20,'pay_by_link'); "
        "INSERT INTO public.payment_attempts(id,order_id,amount,idempotency_key) "
        f"VALUES ('{attempt}','{order}',20,'unbound-race-key'); "
        "INSERT INTO public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,line_total) "
        f"VALUES ('{order}','83000000-0000-4000-8000-000000000015','Race item',2,10,20);", "postgres")
    output = fixture.sql(container, f"SET ROLE service_role; SELECT public.wa_record_unbound_payment_status('{status}');", "postgres")
    if not output.startswith("SET\n"):
        raise RuntimeError("Unbound fixture did not observe its service-role result")
    pending = json.loads(output.split("\n", 1)[1])["pending_id"]
    first_seen = fixture.sql(container, f"SELECT first_seen FROM private.wa_pending_payment_verifications WHERE id='{pending}'", "postgres")
    fixture.sql(container, f"UPDATE public.payment_attempts SET invoice_id='unbound-race-invoice' WHERE id='{attempt}'", "postgres")
    first, second = open_psql(container), open_psql(container)
    try:
        write_sql(first, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL ROLE service_role; "
            f"SELECT public.wa_bind_unbound_payment_status('{pending}');")
        bound = json.loads(first.stdout.readline())
        write_sql(second, "BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL application_name='unbound-callback-race'; "
            f"SET LOCAL ROLE service_role; SELECT public.wa_record_provider_payment_outcome('{order}','{attempt}',"
            f"'{status}'::jsonb||'{{\"amount_millis\":20000,\"currency\":\"KWD\"}}','verified_callback'); COMMIT;")
        write_sql(first, "RESET ROLE; " + observe_lock("unbound-callback-race") + "COMMIT;")
        for process in (first, second):
            process.stdin.close()
            process.wait(timeout=15)
            if process.returncode:
                raise RuntimeError("Unbound/callback race failed: " + process.stderr.read().strip())
        replay = json.loads(second.stdout.read().strip())
        if bound["processed"] is not True or bound["payment_result"]["changed"] is not True or replay["changed"] is not False:
            raise RuntimeError("Mapping repair/callback did not select one payment writer")
        if bound["payment_result"]["outcome_id"] != replay["outcome_id"]:
            raise RuntimeError("Mapping repair/callback selected different notification owners")
        persisted = json.loads(fixture.sql(container, f"SELECT jsonb_build_array("
            f"(SELECT count(*) FROM private.wa_payment_outcomes WHERE order_id='{order}'),"
            f"(SELECT count(*) FROM private.wa_pending_payment_verifications WHERE order_id='{order}'),"
            f"(SELECT attempt_count FROM private.wa_pending_payment_verifications WHERE id='{pending}'))", "postgres"))
        if persisted != [1, 1, 0] or fixture.sql(container,
                f"SELECT first_seen FROM private.wa_pending_payment_verifications WHERE id='{pending}'", "postgres") != first_seen:
            raise RuntimeError("Mapping repair duplicated/reset recovery identity or consumed a GET attempt")
    finally:
        close_processes((first, second))


def prove_schema_case(container, state, baseline, preexisting_private, runtime):
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
    order = concurrent_automatic_and_manual(container)
    preparation = prepared_submission(container, order)
    sql_payload_matches_adapter(preparation, runtime[0], runtime[1])
    concurrent_begin_submission(container, preparation)
    concurrent_begin_and_credential_mutation(container, preparation)
    concurrent_unbound_and_callback(container)
    return {"preexisting_private": preexisting_private, "schema_applications": 2,
        "baseline_unchanged": True, "schema_fingerprint": hashlib.sha256(before.encode()).hexdigest(),
        "actual_role_fixtures": True, "forced_callback_webhook_contention": True,
        "one_first_success_one_replay": True, "concurrent_get_claims_skip_locked": True,
        "concurrent_strict_completion_one_evidence_one_shipa_receipt": True,
        "concurrent_manual_clicks_single_intent_review": True,
        "concurrent_automatic_manual_single_identity": True, "actual_sql_payload_matches_deno_adapter": True,
        "concurrent_begin_one_marker_one_authorized_worker": True,
        "concurrent_begin_blocks_credential_mutation": True, "unbound_callback_one_owner_preserved_history": True,
        "production_access": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--deno", type=Path, required=True)
    parser.add_argument("--deno-cache", type=Path, required=True)
    args = parser.parse_args()
    version = subprocess.run([str(args.deno), "--version"], capture_output=True, text=True, check=True)
    if version.stdout.splitlines()[0] != "deno 2.5.6 (stable, release, x86_64-pc-windows-msvc)":
        raise RuntimeError("Proof requires the verified Deno 2.5.6 Windows runtime")
    state = json.loads(args.state.read_text(encoding="utf-8"))
    container = fixture.marker_guard(state)
    try:
        receipts = [prove_schema_case(container, args.state, args.baseline, existing, (args.deno, args.deno_cache))
                    for existing in (False, True)]
        print(json.dumps({"shared_payment_owner_proof": receipts}))
    finally:
        fixture.restore(args.state, args.baseline)
        apply_schema(container)


if __name__ == "__main__":
    main()
