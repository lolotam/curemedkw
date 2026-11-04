"""Verify schema release composition from Git bytes, without executing SQL."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

BASELINE = "878dde5748548094aab457b54402809d81770668"
INVENTORY = "docs/releases/curemed-schema-20261104.json"
INVENTORY_SHA256 = "af08cb473cfc52186ac1bf35181a34d6731d05ac1716fcd3081747af046b62e6"
SOURCES = "docs/releases/curemed-schema-sources-20261104.json"
OWN_PATHS = {
    INVENTORY,
    SOURCES,
    "docs/releases/curemed-schema-20261104.md",
    "scripts/verify-curemed-schema-release.py",
    "scripts/tests/test_curemed_schema_release.py",
}


class ReleaseCompositionError(RuntimeError):
    """A release contains missing, changed or out-of-scope source."""


def git(root, *args):
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True)
    if result.returncode:
        raise ReleaseCompositionError("Git snapshot unavailable")
    return result.stdout


def verify(root, base=BASELINE, staged=False):
    ref = ":" if staged else "HEAD:"

    def read(path):
        return git(root, "show", ref + path)

    raw_inventory = read(INVENTORY)
    if hashlib.sha256(raw_inventory).hexdigest() != INVENTORY_SHA256:
        raise ReleaseCompositionError("Frozen migration inventory changed")
    inventory = json.loads(raw_inventory)
    migrations = inventory["migrations"]
    names = [item["filename"] for item in migrations]
    if (len(migrations) != 20 or names != sorted(set(names))
            or [x["ordinal"] for x in migrations] != list(range(1, 21))):
        raise ReleaseCompositionError("Migration count/order mismatch")
    sources = json.loads(read(SOURCES))
    records = sources["paths"]
    selected = {entry["path"] for entry in records}
    if len(records) != len(selected):
        raise ReleaseCompositionError("Duplicate selected source")
    if {x["path"] for x in migrations} != {
        p for p in selected if p.startswith("supabase/migrations/")
    }:
        raise ReleaseCompositionError("Selected migration set mismatch")
    if any(not p.startswith(("supabase/migrations/", "supabase/tests/"))
           or ".." in Path(p).parts for p in selected):
        raise ReleaseCompositionError("Non-schema source selected")
    args = ["diff", "--name-only", "--diff-filter=ACDMRT", base]
    args += ["--cached"] if staged else ["HEAD"]
    changed = set(git(root, *args).decode("utf-8").splitlines())
    if changed != selected | OWN_PATHS:
        raise ReleaseCompositionError("Release contains missing or out-of-scope paths")
    for entry in [*records, *migrations]:
        data = read(entry["path"])
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if (hashlib.sha256(data).hexdigest() != entry["sha256GitBytes"]
                or len(data) != entry["bytes"] or blob != entry["gitBlob"]):
            raise ReleaseCompositionError("Frozen source bytes changed: " + entry["path"])
    return {"migrations": len(migrations), "selectedProofSources": len(records) - len(migrations),
            "changedPaths": len(changed), "canonicalGitBytes": "PASS", "sqlExecuted": False,
            "applicationChanges": False, "snapshot": "index" if staged else "HEAD"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=BASELINE)
    parser.add_argument("--staged", action="store_true")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.root, args.base, args.staged)))
    except (ReleaseCompositionError, ValueError, KeyError, OSError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
