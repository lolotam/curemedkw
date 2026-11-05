"""Fail closed before app publication unless the frozen schema is already recorded."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

INVENTORY = "docs/releases/curemed-schema-20261105.json"
INVENTORY_SHA256 = "1d7e48c32fb35b9ae513bfbb58a32e89dfecd1f7a54525d5dd09dd9cb3c51dce"
FILENAME = re.compile(r"[0-9]{14}_[a-z0-9_]+\.sql\Z")
CONTAINER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\Z")


class SchemaReadinessError(RuntimeError):
    """Fixed readiness failure only; upstream output is never disclosed."""


def read_live_ledger(container, filenames):
    if (not CONTAINER.fullmatch(container) or not 1 <= len(filenames) <= 22
            or any(len(x) > 200 or not FILENAME.fullmatch(x) for x in filenames)):
        raise SchemaReadinessError("schema_target_invalid")
    quoted = ",".join("'" + name + "'" for name in filenames)
    # Bound data before psql serializes it, even if an unexpected ledger lacks
    # uniqueness or contains huge text. 23 bounded rows stay below 32KiB;
    # a duplicate/extra row still fails the exact twenty-two-row comparison.
    query = ("SELECT COALESCE(json_agg(json_build_object('filename',filename,'checksum',checksum)),"
             "'[]'::json)::text FROM (SELECT CASE WHEN octet_length(filename)<=200 THEN filename END AS filename,"
             "CASE WHEN octet_length(checksum)=64 THEN substring(checksum from '^[0-9a-f]{64}$') END AS checksum "
             "FROM public.self_hosted_migrations WHERE filename IN (" + quoted + ") LIMIT 23) bounded;")
    try:
        # Match the subsequent migration runner's supported target overrides.
        database_user = os.environ.get("SUPABASE_DB_USER") or "postgres"
        database_name = os.environ.get("SUPABASE_DB_NAME") or "postgres"
        result = subprocess.run(["docker", "exec", "-i", container, "psql", "-X", "-v",
                                 "ON_ERROR_STOP=1", "-U", database_user, "-d", database_name, "-At", "-c", query],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=15)
        if result.returncode or len(result.stdout) > 32768:
            raise ValueError()
        return json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        raise SchemaReadinessError("schema_ledger_unavailable") from None


def read_payment_guards(container):
    if not CONTAINER.fullmatch(container):
        raise SchemaReadinessError("schema_target_invalid")
    query = """SELECT COALESCE((SELECT retention_ready FROM private.integration_payment_release WHERE singleton),false)
      AND EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.integration_myfatoorah_invoice_unique') AND indisvalid AND indisunique)
      AND (SELECT count(*)=2 FROM pg_trigger WHERE tgrelid='public.payment_attempts'::regclass
        AND tgname IN ('integration_invoice_identity_guard','integration_invoice_truncate_guard')
        AND tgenabled IN ('O','A') AND tgfoid='private.integration_guard_invoice_identity()'::regprocedure);"""
    try:
        result = subprocess.run(["docker", "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
            "-U", os.environ.get("SUPABASE_DB_USER") or "postgres", "-d", os.environ.get("SUPABASE_DB_NAME") or "postgres",
            "-At", "-c", query], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=15)
        return result.returncode == 0 and result.stdout.strip() == "t"
    except (OSError, subprocess.SubprocessError):
        return False


def verify_prerequisites(repo, manifest, container, read_ledger=read_live_ledger, read_guards=read_payment_guards):
    config = manifest.get("schemaPrerequisites")
    if config is None:
        if "shipa-admin" in manifest.get("deployFunctions", []):
            raise SchemaReadinessError("schema_prerequisite_declaration_required")
        return {"required": False, "schemaReady": None, "databaseRead": False}
    if not isinstance(config, dict) or config != {"inventory": INVENTORY}:
        raise SchemaReadinessError("schema_prerequisite_declaration_invalid")
    try:
        raw = (repo / INVENTORY).read_bytes()
        if hashlib.sha256(raw).hexdigest() != INVENTORY_SHA256:
            raise SchemaReadinessError("schema_inventory_mismatch")
        migrations = json.loads(raw)["migrations"]
        expected = {item["filename"]: item["sha256GitBytes"] for item in migrations}
        if len(migrations) != 22 or len(expected) != 22:
            raise SchemaReadinessError("schema_inventory_mismatch")
        for item in migrations:
            if not FILENAME.fullmatch(item["filename"]) or item["path"] != "supabase/migrations/" + item["filename"]:
                raise SchemaReadinessError("schema_inventory_mismatch")
            if hashlib.sha256((repo / item["path"]).read_bytes()).hexdigest() != item["sha256GitBytes"]:
                raise SchemaReadinessError("schema_source_mismatch")
    except (OSError, ValueError, KeyError, TypeError):
        raise SchemaReadinessError("schema_inventory_unavailable") from None
    try:
        rows = read_ledger(container, list(expected))
    except Exception:
        raise SchemaReadinessError("schema_ledger_unavailable") from None
    if not isinstance(rows, list) or len(rows) != len(expected):
        raise SchemaReadinessError("schema_not_ready")
    observed = {}
    for row in rows:
        if (not isinstance(row, dict) or set(row) != {"filename", "checksum"}
                or not isinstance(row["filename"], str) or row["filename"] in observed):
            raise SchemaReadinessError("schema_ledger_invalid")
        observed[row["filename"]] = row["checksum"]
    if observed != expected:
        raise SchemaReadinessError("schema_not_ready")
    if not read_guards(container):
        raise SchemaReadinessError("payment_guards_not_ready")
    return {"required": True, "schemaReady": True, "verifiedMigrations": len(expected),
            "databaseRead": True, "schemaActivated": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--container", required=True)
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError()
        print(json.dumps(verify_prerequisites(args.repo, manifest, args.container)))
    except (SchemaReadinessError, OSError, ValueError, TypeError):
        parser.exit(1, "schema_prerequisites_failed; dependent application publication refused\n")


if __name__ == "__main__":
    main()
