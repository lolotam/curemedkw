"""Real local Git boundaries prove composition refusals; SQL is never executed."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "schema_release", REPO / "scripts/verify-curemed-schema-release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class SchemaReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sources = json.loads((REPO / release.SOURCES).read_text(encoding="utf-8"))
        paths = release.OWN_PATHS | {x["path"] for x in sources["paths"]}
        cls.files = {p: (REPO / p).read_bytes().replace(b"\r\n", b"\n") for p in paths}
        cls.migration = sources["paths"][0]["path"]

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="curemed-schema-git-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.git("init", "--initial-branch=main")
        self.git("config", "user.email", "schema-proof@example.test")
        self.git("config", "user.name", "Curemed schema proof")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.autocrlf", "false")
        self.git("config", "core.hooksPath", str(self.root / "no-hooks"))
        (self.root / "baseline.txt").write_text("synthetic baseline\n", encoding="utf-8")
        old_source = self.root / "src/legacy-runtime.ts"
        old_source.parent.mkdir()
        old_source.write_bytes(self.files["supabase/tests/shipa/invoice_guard.sql"])
        self.git("add", "baseline.txt")
        self.git("add", "src/legacy-runtime.ts")
        self.git("commit", "-m", "synthetic baseline")
        self.base = self.git("rev-parse", "HEAD").decode().strip()
        for path, data in self.files.items():
            target = self.root / path
            assert target.resolve().is_relative_to(self.root)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        self.git("add", ".")

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args],
                                       stderr=subprocess.DEVNULL)

    def test_canonical_schema_only_index_passes(self):
        result = release.verify(self.root, self.base, staged=True)
        self.assertEqual(result["migrations"], 20)
        self.assertFalse(result["sqlExecuted"])
        self.assertFalse(result["applicationChanges"])

    def test_changed_migration_is_refused(self):
        with (self.root / self.migration).open("ab") as target:
            target.write(b"\n-- unexpected migration edit\n")
        self.git("add", self.migration)
        with self.assertRaisesRegex(release.ReleaseCompositionError, "Frozen source bytes changed"):
            release.verify(self.root, self.base, staged=True)

    def test_runtime_file_is_refused(self):
        target = self.root / "src/unreviewed-runtime.ts"
        target.parent.mkdir(exist_ok=True)
        target.write_text("export const runtime = true;\n", encoding="utf-8")
        self.git("add", "src/unreviewed-runtime.ts")
        with self.assertRaisesRegex(release.ReleaseCompositionError, "out-of-scope"):
            release.verify(self.root, self.base, staged=True)

    def test_missing_migration_is_refused(self):
        self.git("rm", "--cached", self.migration)
        with self.assertRaisesRegex(release.ReleaseCompositionError, "missing"):
            release.verify(self.root, self.base, staged=True)

    def test_coordinated_proof_and_source_manifest_removal_is_refused(self):
        path = "supabase/tests/shipa/invoice_guard.sql"
        manifest_path = self.root / release.SOURCES
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["paths"] = [x for x in manifest["paths"] if x["path"] != path]
        manifest_path.write_bytes((json.dumps(manifest, indent=2) + "\n").encode())
        self.git("add", release.SOURCES)
        self.git("rm", "--cached", path)
        with self.assertRaisesRegex(release.ReleaseCompositionError, "Frozen proof-source inventory changed"):
            release.verify(self.root, self.base, staged=True)

    def test_rename_cannot_hide_deletion_of_baseline_runtime(self):
        self.git("config", "diff.renames", "true")
        self.git("rm", "src/legacy-runtime.ts")
        with self.assertRaisesRegex(release.ReleaseCompositionError, "out-of-scope"):
            release.verify(self.root, self.base, staged=True)


if __name__ == "__main__":
    unittest.main()
