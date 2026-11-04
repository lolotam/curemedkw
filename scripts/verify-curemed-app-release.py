"""Verify the exact stacked app closure and immutable inputs without SQL/network."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

BASE = "548aec2844bdb6f561cfb6cb304fee2bce8c35ca"
SOURCES = "docs/releases/curemed-app-sources-20261104.json"
SOURCES_SHA256 = "a5fb0161aed99e82ae3ca212c97471cb149a5fefc260ebdbc3ade4ef6e087082"
CORRECTIONS = {"ops/edge-env.manifest.example.json", "supabase/config.toml"}
ADDITIONS = {
    SOURCES, "docs/releases/curemed-app-20261104.md", "scripts/verify-curemed-app-release.py",
    "scripts/check-curemed-schema-prerequisites.py", "scripts/supabase-post-deploy.sh",
    "scripts/tests/test_curemed_app_deployment.py", "scripts/tests/test_curemed_schema_prerequisites.py",
    "src/lib/orderDeletion.ts", "src/pages/admin/AdminOrders.tsx",
    "src/pages/admin/AdminOrdersDeletion.test.tsx",
}


def verify(root, staged=False):
    def git(*args):
        return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.DEVNULL)
    ref = ":" if staged else "HEAD:"
    raw_sources = git("show", ref + SOURCES)
    if hashlib.sha256(raw_sources).hexdigest() != SOURCES_SHA256:
        raise ValueError("Frozen application source inventory changed")
    manifest = json.loads(raw_sources)
    if manifest["schemaBase"] != BASE:
        raise ValueError("Application schema base mismatch")
    records = manifest["paths"]
    selected = {x["path"] for x in records}
    if len(records) != 106 or len(selected) != 106:
        raise ValueError("Application dependency set changed")
    changed = set(git("diff", "--no-renames", "--no-ext-diff", "--name-only", BASE,
                      *(["--cached"] if staged else ["HEAD"])).decode().splitlines())
    if changed != selected | ADDITIONS or any(p.endswith(".sql") for p in changed):
        raise ValueError("Application release path set/zero-SQL invariant violated")
    git("merge-base", "--is-ancestor", BASE, "HEAD")
    chain = git("rev-list", "--parents", BASE + "..HEAD").decode().splitlines()
    if any(len(line.split()) != 2 for line in chain):
        raise ValueError("Application closure must preserve linear schema-based ancestry")
    for entry in records:
        if entry["path"] in CORRECTIONS:
            continue
        data = git("show", ref + entry["path"])
        if hashlib.sha256(data).hexdigest() != entry["sha256GitBytes"]:
            raise ValueError("Unexpected imported application source drift: " + entry["path"])
    return {"schemaBase": BASE, "changedPaths": len(changed), "importedSources": len(records),
            "explicitImportedCorrections": sorted(CORRECTIONS), "sqlDelta": 0,
            "unchangedImportedBytes": "PASS", "snapshot": "index" if staged else "HEAD"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(Path(__file__).resolve().parents[1], args.staged)))
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        parser.exit(1, "Application closure composition failed\n")


if __name__ == "__main__":
    main()
