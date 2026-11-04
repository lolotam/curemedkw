"""Real Deno services/crypto against actual RPC SQL on the guarded fixture."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "supabase/tests/whatsapp"))
import fixture

ACTOR = "89000000-0000-4000-8000-000000000001"
RPCS = {
    "shipa_read_settings": (("_actor_id", "uuid"),),
    "shipa_save_settings": (("_expected_revision", "integer"), ("_settings", "jsonb"), ("_credential_change", "jsonb"), ("_actor_id", "uuid")),
    "shipa_read_credential": (("_integration_id", "uuid"), ("_environment", "text")),
    "shipa_record_provider_observation": (("_expected_revision", "integer"), ("_environment", "text"), ("_observation", "jsonb"), ("_actor_id", "uuid")),
    "shipa_read_readiness": (("_actor_id", "uuid"),),
}


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def execute_rpc(container, request):
    signature = RPCS.get(request["fn"])
    if not signature or set(request["args"]) != {name for name, _ in signature}:
        raise RuntimeError("Unexpected bridge RPC/arguments")
    arguments = []
    for name, cast in signature:
        value = request["args"][name]
        if value is None:
            arguments.append("NULL::" + cast)
        else:
            encoded = json.dumps(value) if cast == "jsonb" else str(value)
            arguments.append(literal(encoded) + "::" + cast)
    call = "public." + request["fn"] + "(" + ",".join(arguments) + ")"
    # The temporary function is SECURITY INVOKER. The actual call executes as
    # service_role; it only converts SQL errors to the SDK response envelope.
    query = "CREATE FUNCTION pg_temp.service_bridge() RETURNS jsonb LANGUAGE plpgsql AS $bridge$ " \
        "DECLARE document jsonb; BEGIN document:=" + call + "; RETURN jsonb_build_object('data',document,'error',NULL,'status',200,'count',NULL,'statusText','OK'); " \
        "EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',SQLSTATE,'message',SQLERRM),'status',400); END $bridge$; " \
        "GRANT EXECUTE ON FUNCTION pg_temp.service_bridge() TO service_role; SET ROLE service_role; SELECT pg_temp.service_bridge();"
    return json.loads(fixture.sql(container, query, "postgres").splitlines()[-1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--deno", type=Path, required=True)
    parser.add_argument("--deno-cache", type=Path, required=True)
    parser.add_argument("--handler", action="store_true", help="Exercise the HTTP handler and real SDK over the local SQL bridge")
    args = parser.parse_args()
    state = json.loads(args.state.read_text(encoding="utf-8"))
    container = fixture.marker_guard(state)
    initial = json.loads(fixture.sql(container, "SELECT to_jsonb(i) FROM public.integrations i WHERE provider='shipa'", "postgres"))
    empty = fixture.sql(container, "SELECT (SELECT count(*) FROM private.integration_credentials)+"
        "(SELECT count(*) FROM private.shipa_provider_observations)+(SELECT count(*) FROM private.shipa_scheduler_runs)", "postgres")
    if initial["revision"] != 0 or initial["enabled"] or initial["updated_by"] is not None or empty != "0":
        raise RuntimeError("Bridge requires the clean assembled disposable fixture")
    fixture.sql(container, f"INSERT INTO auth.users(id,email) VALUES('{ACTOR}','configuration-bridge@example.test'); "
        f"INSERT INTO public.user_roles(user_id,role) VALUES('{ACTOR}','admin');", "postgres")
    process = None
    calls = 0
    try:
        process = subprocess.Popen([str(args.deno), "run", "--config", str(ROOT / "deno.shipa.json"), "--frozen", "--cached-only",
            str(ROOT / "supabase/tests/shipa" / ("verify_admin_handler.ts" if args.handler else "verify_configuration_services.ts"))], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, encoding="utf-8", env=dict(os.environ, DENO_DIR=str(args.deno_cache)))
        receipt = None
        for line in process.stdout:
            request = json.loads(line)
            if request["kind"] == "complete":
                receipt = request["receipt"]
                break
            if request["kind"] not in (("rpc", "role") if args.handler else ("rpc",)) or calls >= (60 if args.handler else 30):
                raise RuntimeError("Unexpected bridge operation or excessive RPC count")
            calls += 1
            if request["kind"] == "role":
                if request != {"kind": "role", "actor": ACTOR}:
                    raise RuntimeError("Unexpected role lookup binding")
                rows = fixture.sql(container, "SET ROLE service_role; SELECT coalesce(jsonb_agg(jsonb_build_object('role',role)),'[]'::jsonb) "
                    f"FROM public.user_roles WHERE user_id='{ACTOR}' AND role='admin'", "postgres").splitlines()[-1]
                response = {"data": json.loads(rows), "error": None, "status": 200}
            else:
                response = execute_rpc(container, request)
            process.stdin.write(json.dumps(response) + "\n")
            process.stdin.flush()
        process.wait(timeout=15)
        if process.returncode or receipt is None:
            raise RuntimeError("Deno-to-SQL service bridge failed: " + process.stderr.read().strip())
        if fixture.sql(container, "SELECT enabled FROM public.integrations WHERE provider='shipa'", "postgres") != "f":
            raise RuntimeError("Configuration bridge enabled dispatch")
        print(json.dumps({"configuration_service_bridge": receipt, "rpc_count": calls, "production_access": False}))
    finally:
        if process is not None:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()
        # Only exact synthetic rows created by this proof are removed; no reset
        # or broad cleanup is permitted on any unguarded database.
        fixture.marker_guard(state)
        binding = initial["id"]
        fixture.sql(container, f"DELETE FROM private.shipa_provider_observations WHERE integration_id='{binding}' AND observed_by='{ACTOR}'; "
            f"DELETE FROM private.integration_credentials WHERE integration_id='{binding}' AND updated_by='{ACTOR}'; "
            "UPDATE public.integrations SET revision=0,configuration=" + literal(json.dumps(initial["configuration"])) + "::jsonb,updated_by=NULL,updated_at="
            + literal(initial["updated_at"]) + f"::timestamptz WHERE id='{binding}' AND updated_by='{ACTOR}'; "
            f"DELETE FROM public.user_roles WHERE user_id='{ACTOR}'; DELETE FROM auth.users WHERE id='{ACTOR}';", "postgres")


if __name__ == "__main__":
    main()
