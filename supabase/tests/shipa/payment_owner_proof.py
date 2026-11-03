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
    "20261103001200_shipa_integrity.sql", "20261103001300_integration_payment_owner.sql"))
TESTS = tuple(ROOT / "supabase/tests/whatsapp" / name for name in (
    "privileges.sql", "transactions.sql", "settings.sql", "credentials.sql", "activation.sql")) + (
        ROOT / "supabase/tests/shipa/payment_owner.sql",)


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
    return {"preexisting_private": preexisting_private, "schema_applications": 2,
        "baseline_unchanged": True, "schema_fingerprint": hashlib.sha256(before.encode()).hexdigest(),
        "actual_role_fixtures": True, "forced_callback_webhook_contention": True,
        "one_first_success_one_replay": True, "production_access": False}


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
