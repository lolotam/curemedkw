"""Local disposable fixture only. Never accepts a database URL or remote host."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid

IMAGE = "sha256:0e2279598bc0224fb5960c3a61eb23270cd60119427f3a7bdec86ba282600dcc"
FIXTURE_DATABASE_AUTH = "fixture-only-not-a-production-credential"
BASELINE_HASH = "0c861d4b8a7623367ec29663ec7c81ac50a08237472fce284f888aa88a4f35b7"
HERE = Path(__file__).resolve().parent
COMPOSE = HERE.parent / "compose.whatsapp.yml"


def command(argv, *, stdin=None, env=None):
    completed = subprocess.run(argv, input=stdin, text=True, encoding="utf-8",
                               capture_output=True, env=env)
    if completed.returncode:
        # Fixture output contains synthetic data only, but do not dump schema bodies.
        raise RuntimeError(f"{argv[0]} operation failed: {completed.stderr[-1200:]}")
    return completed.stdout.strip()


def local_context():
    endpoint_override = os.environ.get("DOCKER_HOST", "")
    if endpoint_override and not endpoint_override.startswith(("npipe:////./pipe/", "unix:///")):
        raise RuntimeError("Remote Docker endpoint refused")
    context = command(["docker", "context", "show"])
    endpoint = command(["docker", "context", "inspect", context,
                        "--format", "{{.Endpoints.docker.Host}}"])
    if not endpoint.startswith(("npipe:////./pipe/", "unix:///")):
        raise RuntimeError("Fixture requires a local Docker socket")
    return context


def compose(state, *args):
    env = dict(os.environ, WA_FIXTURE_MARKER=state["marker"],
               WA_FIXTURE_SUBNET=state["subnet"],
               WA_FIXTURE_DATABASE_AUTH=FIXTURE_DATABASE_AUTH)
    return command(["docker", "compose", "-p", state["project"], "-f",
                    str(COMPOSE), *args], env=env)


def unused_subnet():
    network_ids = command(["docker", "network", "ls", "-q"]).splitlines()
    networks = json.loads(command(["docker", "network", "inspect", *network_ids]))
    occupied = [ipaddress.ip_network(config["Subnet"])
                for network in networks for config in (network["IPAM"].get("Config") or [])
                if config.get("Subnet")]
    for index in range(254, 0, -1):
        candidate = ipaddress.ip_network(f"10.254.{index}.0/28")
        if not any(candidate.overlaps(existing) for existing in occupied
                   if existing.version == 4):
            return str(candidate)
    raise RuntimeError("No non-overlapping isolated fixture subnet available")


def validate_state(state):
    if local_context() != state["context"]:
        raise RuntimeError("Docker context changed")
    if not re.fullmatch(r"curemed-wa-fixture-[a-f0-9]{12}", state["project"]):
        raise RuntimeError("Non-fixture project refused")
    uuid.UUID(state["marker"])
    subnet = ipaddress.ip_network(state["subnet"], strict=True)
    if subnet.prefixlen != 28 or not subnet.subnet_of(ipaddress.ip_network("10.254.0.0/16")):
        raise RuntimeError("Unexpected fixture subnet")


def inspect_guard(state):
    validate_state(state)
    container = compose(state, "ps", "-q", "db")
    if not container:
        raise RuntimeError("Fixture container missing")
    details = json.loads(command(["docker", "inspect", container]))[0]
    labels = details["Config"].get("Labels", {})
    expected = {
        "com.curemed.fixture": "whatsapp",
        "com.curemed.fixture.marker": state["marker"],
        "com.docker.compose.project": state["project"],
    }
    if any(labels.get(key) != wanted for key, wanted in expected.items()):
        raise RuntimeError("Fixture container labels mismatch")
    if details["Image"] != IMAGE or details["HostConfig"].get("PortBindings"):
        raise RuntimeError("Unexpected fixture image or published port")
    mounts = details["Mounts"]
    if len(mounts) != 1 or mounts[0]["Type"] != "volume":
        raise RuntimeError("External/bind fixture mounts refused")
    volume = json.loads(command(["docker", "volume", "inspect", mounts[0]["Name"]]))[0]
    if (volume.get("Labels", {}).get("com.curemed.fixture.marker") != state["marker"]
            or volume.get("Labels", {}).get("com.docker.compose.project") != state["project"]):
        raise RuntimeError("Fixture volume ownership mismatch")
    networks = details["NetworkSettings"]["Networks"]
    if len(networks) != 1:
        raise RuntimeError("Unexpected fixture networks")
    network = json.loads(command(["docker", "network", "inspect", next(iter(networks))]))[0]
    if not network["Internal"] or network.get("Labels", {}).get("com.docker.compose.project") != state["project"]:
        raise RuntimeError("Fixture network must be private and owned")
    return container


def sql(container, statement, user="supabase_admin"):
    return command(["docker", "exec", "-i", "-e",
                    f"PGPASSWORD={FIXTURE_DATABASE_AUTH}",
                    container, "psql", "-X", "-U", user,
                    "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], stdin=statement)


def marker_guard(state):
    container = inspect_guard(state)
    stored = sql(container, "SELECT marker FROM curemed_fixture_meta.identity;")
    if stored != state["marker"]:
        raise RuntimeError("Database fixture marker mismatch; SQL refused")
    return container


def restore(state_path, baseline):
    baseline_bytes = baseline.read_bytes()
    if hashlib.sha256(baseline_bytes).hexdigest() != BASELINE_HASH:
        raise RuntimeError("Baseline schema hash mismatch")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    container = marker_guard(state)
    sql(container, "DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; "
        "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE;")
    sql(container, baseline_bytes.decode("utf-8"))
    sql(container, "GRANT USAGE ON SCHEMA public TO PUBLIC;")
    restored = command(["docker", "exec", "-e",
                        f"PGPASSWORD={FIXTURE_DATABASE_AUTH}",
                        container, "pg_dump", "-U", "supabase_admin", "-d", "postgres",
                        "--schema-only", "--schema=public", "--schema=auth", "--schema=storage"])
    if restored.strip() != baseline_bytes.decode("utf-8").strip():
        raise RuntimeError("Restored schema parity failed")
    print("Guarded disposable restore and normalized schema/owner/ACL parity passed")


def start(state_path, baseline, *, resume=False):
    if state_path.exists() and not resume:
        raise RuntimeError("Refusing to overwrite fixture state")
    baseline_bytes = baseline.read_bytes()
    if hashlib.sha256(baseline_bytes).hexdigest() != BASELINE_HASH:
        raise RuntimeError("Baseline schema hash mismatch")
    state = (json.loads(state_path.read_text(encoding="utf-8")) if resume else
             {"project": "curemed-wa-fixture-" + uuid.uuid4().hex[:12],
              "marker": str(uuid.uuid4()), "context": local_context(),
              "subnet": unused_subnet()})
    validate_state(state)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state), encoding="utf-8")
    compose(state, "up", "-d", "--wait", "--wait-timeout", "120")
    container = inspect_guard(state)
    initialize_metadata = True
    if resume:
        present = sql(container, "SELECT to_regclass('curemed_fixture_meta.identity') IS NOT NULL;")
        if present == "t":
            marker_guard(state)
            initialize_metadata = False
        elif present == "f":
            schema_exists = sql(container, "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='curemed_fixture_meta');")
            if schema_exists != "f":
                raise RuntimeError("Incomplete fixture metadata refused; marker not established")
        else:
            raise RuntimeError("Unusable fixture metadata observation")
    if initialize_metadata:
        sql(container, "CREATE SCHEMA curemed_fixture_meta; "
            "CREATE TABLE curemed_fixture_meta.identity(marker uuid PRIMARY KEY); "
            f"INSERT INTO curemed_fixture_meta.identity VALUES ('{state['marker']}');")
    marker_guard(state)
    # This target has all four safety gates plus the database marker. It is disposable.
    sql(container, "DROP SCHEMA IF EXISTS public CASCADE; "
        "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE;")
    sql(container, baseline_bytes.decode("utf-8"))
    # Recreating the built-in public schema loses its implicit PUBLIC USAGE ACL.
    # The schema-only reference omits that default, so restore it in this fixture.
    sql(container, "GRANT USAGE ON SCHEMA public TO PUBLIC;")
    sql(container, "ALTER ROLE postgres NOSUPERUSER BYPASSRLS;")
    restored = command(["docker", "exec", "-e",
                        f"PGPASSWORD={FIXTURE_DATABASE_AUTH}",
                        container, "pg_dump", "-U", "supabase_admin",
                        "-d", "postgres", "--schema-only", "--schema=public",
                        "--schema=auth", "--schema=storage"])
    if restored.strip() != baseline_bytes.decode("utf-8").strip():
        protected = state_path.parent / "restored-schema.sql"
        protected.write_text(restored, encoding="utf-8")
        raise RuntimeError("Baseline schema parity failed; protected diff required")
    print(json.dumps({"fixture": state["project"], "baseline_parity": True,
                      "image": IMAGE, "rows_copied": 0}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "resume-start", "restore", "apply", "test", "status"])
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--file", type=Path)
    args = parser.parse_args()
    if args.action in ("start", "resume-start", "restore"):
        if not args.baseline:
            parser.error("--baseline is required")
        if args.action == "restore":
            restore(args.state.resolve(), args.baseline.resolve())
        else:
            start(args.state.resolve(), args.baseline.resolve(), resume=args.action == "resume-start")
        return
    state = json.loads(args.state.read_text(encoding="utf-8"))
    container = marker_guard(state)
    if args.action in ("apply", "test"):
        if not args.file:
            parser.error("--file is required")
        # Migrations use the real non-superuser runner, tests may explicitly SET ROLE.
        print(sql(container, args.file.read_text(encoding="utf-8"), "postgres"))
    else:
        print(json.dumps({"safe_fixture": True, "project": state["project"]}))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError) as failure:
        print(str(failure), file=sys.stderr)
        raise SystemExit(1)
