"""Exercise the release verifier against a captured index; only Git I/O is faked."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("app_release", ROOT / "scripts/verify-curemed-app-release.py")
checks = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checks)


# This verifier belongs to the frozen November 4 release, not later feature heads.
RELEASE_REF = "1819a10"


class AppReleaseContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        inventory = subprocess.check_output(["git", "show", RELEASE_REF + ":" + checks.SOURCES], cwd=ROOT)
        selected = {item["path"] for item in json.loads(inventory)["paths"]}
        cls.paths = selected | checks.ADDITIONS
        cls.captured_blobs = {}
        for path in cls.paths:
            try:
                cls.captured_blobs[path] = subprocess.check_output(["git", "show", RELEASE_REF + ":" + path], cwd=ROOT, stderr=subprocess.DEVNULL)
            except subprocess.CalledProcessError:
                cls.captured_blobs[path] = (ROOT / path).read_bytes().replace(b"\r\n", b"\n")

    def setUp(self):
        self.blobs = self.captured_blobs.copy()

    def git_boundary(self, argv, **_kwargs):
        command = argv[3:]
        if command[0] == "show":
            return self.blobs[command[1].split(":", 1)[1]]
        if command[0] == "diff":
            return ("\n".join(sorted(self.paths)) + "\n").encode()
        if command[0] == "merge-base":
            return b""
        if command[0] == "rev-list":
            return ("synthetic-head " + checks.BASE + "\n").encode()
        raise AssertionError("Unexpected Git operation")

    def verify(self):
        with patch.object(checks.subprocess, "check_output", side_effect=self.git_boundary):
            return checks.verify(ROOT, staged=True)

    def test_frozen_candidate_passes_without_network_or_database(self):
        self.assertEqual(self.verify()["sqlDelta"], 0)

    def test_runtime_overlay_and_config_drift_are_refused(self):
        for path in ["scripts/supabase-post-deploy.sh", "src/lib/orderDeletion.ts", "ops/edge-env.manifest.example.json"]:
            with self.subTest(path=path):
                original = self.blobs[path]
                self.blobs[path] += b"\n# synthetic unintended edit\n"
                try:
                    with self.assertRaises(ValueError):
                        self.verify()
                finally:
                    self.blobs[path] = original

    def test_imported_runtime_drift_is_refused(self):
        self.blobs["src/lib/db.ts"] += b"\n// synthetic unintended edit\n"
        with self.assertRaises(ValueError):
            self.verify()


if __name__ == "__main__":
    unittest.main()
