"""Boundary mocks prove refusal happens before Docker operations or SQL execution."""
import importlib.util
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
