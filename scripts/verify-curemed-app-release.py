"""Verify the exact stacked app closure and immutable inputs without SQL/network."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

BASE = "0522c5534e87025f66ea195175897d2d43adddce"
SOURCES = "docs/releases/curemed-app-sources-20261104.json"
SOURCES_SHA256 = "7e8ba2c14ba9f6f2897b10523f5006721d9e6ea562359d66856d95242d8986fe"
CORRECTIONS = {"ops/edge-env.manifest.example.json", "supabase/config.toml"}
ADDITIONS = {
    SOURCES, "docs/releases/curemed-app-20261104.md", "scripts/verify-curemed-app-release.py",
    "scripts/check-curemed-schema-prerequisites.py", "scripts/supabase-post-deploy.sh",
    "scripts/tests/test_curemed_app_deployment.py", "scripts/tests/test_curemed_schema_prerequisites.py",
    "src/lib/orderDeletion.ts", "src/pages/admin/AdminOrders.tsx",
    "src/pages/admin/AdminOrdersDeletion.test.tsx",
    "src/lib/boundedHttpErrorJson.ts", "scripts/tests/test_curemed_app_release.py",
    "supabase/functions/_tests/shipa/shipa-pr24-boundary-regressions.test.ts",
    "src/lib/pngDataUrl.ts", "supabase/functions/_shared/evolution-pairing-png.ts",
    "supabase/functions/_shared/json-unique-members.ts", "scripts/tests/test_edge_import_specifiers.py",
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
    corrections = manifest["reviewCorrections"]
    if not isinstance(corrections, dict) or not CORRECTIONS <= set(corrections) <= selected:
        raise ValueError("Application correction inventory mismatch")
    for entry in records:
        correction = corrections.get(entry["path"])
        expected = entry["sha256GitBytes"]
        if correction is not None:
            if set(correction) != {"sha256GitBytes", "reason"} or not correction["reason"]:
                raise ValueError("Application correction provenance missing")
            expected = correction["sha256GitBytes"]
        data = git("show", ref + entry["path"])
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("Unexpected imported application source drift: " + entry["path"])
    overlays = manifest["releaseOverlays"]
    # The inventory cannot hash itself, or the verifier containing its own pin.
    # Both metadata roots require exact-head source review; all other overlays
    # (including runtime, tests, configuration and docs) have pinned Git bytes.
    expected_overlays = ADDITIONS - {SOURCES, "scripts/verify-curemed-app-release.py"}
    if not isinstance(overlays, dict) or set(overlays) != expected_overlays:
        raise ValueError("Application overlay inventory mismatch")
    for path, expected in overlays.items():
        if hashlib.sha256(git("show", ref + path)).hexdigest() != expected:
            raise ValueError("Unexpected application overlay drift: " + path)
    return {"schemaBase": BASE, "changedPaths": len(changed), "importedSources": len(records),
            "explicitImportedCorrections": sorted(CORRECTIONS), "sqlDelta": 0,
            "importedSourceIntegrity": "PASS", "reviewCorrectedImports": len(corrections),
            "frozenOverlayBytes": "PASS", "snapshot": "index" if staged else "HEAD"}


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
