"""Fail closed before app publication unless the frozen schema is already recorded."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

INVENTORY = "docs/releases/curemed-schema-20261104.json"
INVENTORY_SHA256 = "af08cb473cfc52186ac1bf35181a34d6731d05ac1716fcd3081747af046b62e6"
FILENAME = re.compile(r"[0-9]{14}_[a-z0-9_]+\.sql\Z")
CONTAINER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\Z")


class SchemaReadinessError(RuntimeError):
    """Fixed readiness failure only; upstream output is never disclosed."""


def read_live_ledger(container, filenames):
    if not CONTAINER.fullmatch(container) or any(not FILENAME.fullmatch(x) for x in filenames):
        raise SchemaReadinessError("schema_target_invalid")
    quoted = ",".join("'" + name + "'" for name in filenames)
    query = ("SELECT COALESCE(json_agg(json_build_object('filename',filename,'checksum',checksum)),"
             "'[]'::json)::text FROM public.self_hosted_migrations WHERE filename IN (" + quoted + ");")
    try:
        result = subprocess.run(["docker", "exec", "-i", container, "psql", "-X", "-v",
                                 "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At", "-c", query],
                                capture_output=True, text=True, timeout=15)
        if result.returncode or len(result.stdout) > 32768:
            raise ValueError()
        return json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        raise SchemaReadinessError("schema_ledger_unavailable") from None


def verify_prerequisites(repo, manifest, container, read_ledger=read_live_ledger):
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
        if len(migrations) != 20 or len(expected) != 20:
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
