"""Boundary mocks prove refusal happens before Docker operations or SQL execution."""
import importlib.util
import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("wa_fixture", Path(__file__).with_name("fixture.py"))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class FixtureSafetyTests(unittest.TestCase):
    def test_remote_endpoint_refuses_before_any_docker_command(self):
        with patch.dict(fixture.os.environ, {"DOCKER_HOST": "ssh://production"}, clear=True):
            with patch.object(fixture, "command") as boundary:
                with self.assertRaisesRegex(RuntimeError, "Remote Docker"):
                    fixture.local_context()
                boundary.assert_not_called()

    def test_remote_context_refuses_after_metadata_inspection(self):
        with patch.dict(fixture.os.environ, {}, clear=True):
            with patch.object(fixture, "command", side_effect=["remote", "tcp://remote:2376"]):
                with self.assertRaisesRegex(RuntimeError, "local Docker"):
                    fixture.local_context()

    def test_nonfixture_project_refuses_before_container_or_sql_access(self):
        state = {"context": "desktop-linux", "project": "production"}
        with patch.object(fixture, "local_context", return_value="desktop-linux"):
            with patch.object(fixture, "compose") as boundary:
                with self.assertRaisesRegex(RuntimeError, "Non-fixture"):
                    fixture.inspect_guard(state)
                boundary.assert_not_called()

    def test_database_marker_mismatch_refuses_operations(self):
        with patch.object(fixture, "inspect_guard", return_value="fixture-container"):
            with patch.object(fixture, "sql", return_value="wrong-marker"):
                with self.assertRaisesRegex(RuntimeError, "marker mismatch"):
                    fixture.marker_guard({"marker": "expected-marker"})

    def run_resume(self, marker_matches=True, metadata_exists=True, namespace_exists=False):
        state = {"context": "desktop-linux", "project": "curemed-wa-fixture-aaaaaaaaaaaa",
                 "marker": "92000000-0000-4000-8000-000000000001", "subnet": "10.254.254.0/28"}
        baseline = "-- synthetic schema-only baseline\n"
        operations = []

        def sql(_container, statement, _user="supabase_admin"):
            nonlocal metadata_exists
            operations.append(statement)
            if "to_regclass('curemed_fixture_meta.identity')" in statement:
                return "t" if metadata_exists else "f"
            if "pg_namespace" in statement and "curemed_fixture_meta" in statement:
                return "t" if namespace_exists else "f"
            if statement.startswith("CREATE SCHEMA curemed_fixture_meta;"):
                if metadata_exists:
                    raise RuntimeError("duplicate_schema")
                metadata_exists = True
                return ""
            if statement.startswith("SELECT marker FROM curemed_fixture_meta.identity"):
                return state["marker"] if marker_matches else "different-marker"
            return ""

        with tempfile.TemporaryDirectory(prefix="curemed-fixture-resume-") as directory:
            folder = Path(directory)
            state_path = folder / "state.json"
            baseline_path = folder / "baseline.sql"
            state_path.write_text(json.dumps(state), encoding="utf-8")
            baseline_path.write_bytes(baseline.encode())
            with patch.object(fixture, "BASELINE_HASH", hashlib.sha256(baseline.encode()).hexdigest()), \
                    patch.object(fixture, "local_context", return_value=state["context"]), \
                    patch.object(fixture, "compose"), patch.object(fixture, "inspect_guard", return_value="fixture"), \
                    patch.object(fixture, "sql", side_effect=sql), \
                    patch.object(fixture, "command", return_value=baseline.strip()), \
                    contextlib.redirect_stdout(io.StringIO()):
                try:
                    fixture.start(state_path, baseline_path, resume=True)
                except RuntimeError:
                    self.assertFalse(any(op.startswith("DROP SCHEMA") for op in operations))
                    self.assertFalse(any(op.startswith("CREATE SCHEMA curemed_fixture_meta;") for op in operations))
                    raise
        return operations

    def test_resume_reuses_existing_verified_metadata_without_recreation(self):
        operations = self.run_resume()
        self.assertFalse(any(op.startswith("CREATE SCHEMA curemed_fixture_meta;") for op in operations))
        self.assertTrue(any(op.startswith("SELECT marker") for op in operations))

    def test_resume_marker_mismatch_refuses_before_metadata_or_restore_writes(self):
        with self.assertRaisesRegex(RuntimeError, "marker mismatch"):
            self.run_resume(marker_matches=False)

    def test_resume_can_initialize_metadata_only_when_absent(self):
        operations = self.run_resume(metadata_exists=False)
        self.assertEqual(sum(op.startswith("CREATE SCHEMA curemed_fixture_meta;") for op in operations), 1)

    def test_resume_refuses_partial_metadata_instead_of_adopting_it(self):
        with self.assertRaisesRegex(RuntimeError, "Incomplete fixture metadata refused"):
            self.run_resume(metadata_exists=False, namespace_exists=True)


if __name__ == "__main__":
    unittest.main()
