"""Exercise proof orchestration with a mocked DB boundary, never SQL execution."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / "supabase/tests/whatsapp"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fixture = load("core_fixture", HERE / "fixture.py")
with patch.dict(sys.modules, {"fixture": fixture}):
    proof = load("core_proof", HERE / "core_proof.py")


class CoreReapplicationTests(unittest.TestCase):
    def run_proof(self, new_object_drift):
        applied = 0
        core = (ROOT / "supabase/migrations/20261103000100_whatsapp_core.sql").read_text(encoding="utf-8")
        privileges = (HERE / "privileges.sql").read_text(encoding="utf-8")

        def sql(_container, statement, _user=None):
            nonlocal applied
            if statement == core:
                applied += 1
                return ""
            if statement == privileges:
                return ""
            if statement.startswith("SELECT string_agg"):
                return "1" if applied == 0 else "1,2"
            if statement.lstrip().startswith("SELECT jsonb_build_object"):
                if "ANY(ARRAY[1,2]" in statement:
                    return "new-object-drift" if applied == 2 and new_object_drift else "all-tracked-metadata"
                return "unchanged-baseline-metadata"
            raise AssertionError("Unexpected mock DB boundary operation")

        with tempfile.TemporaryDirectory(prefix="curemed-proof-orchestration-") as directory:
            state = Path(directory) / "state.json"
            state.write_text("{}", encoding="utf-8")
            output = io.StringIO()
            with patch.object(fixture, "restore"), patch.object(fixture, "marker_guard", return_value="fixture"), \
                    patch.object(fixture, "sql", side_effect=sql), \
                    patch.object(sys, "argv", ["core_proof.py", "--state", str(state), "--baseline", "synthetic-only"]), \
                    contextlib.redirect_stdout(output):
                proof.main()
            return json.loads(output.getvalue())

    def test_new_relation_drift_on_reapplication_is_not_hidden_by_baseline_snapshot(self):
        with self.assertRaisesRegex(RuntimeError, "New integration metadata drift"):
            self.run_proof(new_object_drift=True)

    def test_unchanged_baseline_and_new_relations_report_their_separate_scope(self):
        result = self.run_proof(new_object_drift=False)
        self.assertTrue(result["existing_objects_unchanged"])
        self.assertTrue(result["new_integration_metadata_unchanged"])
        self.assertEqual(result["passes"], 2)


if __name__ == "__main__":
    unittest.main()
