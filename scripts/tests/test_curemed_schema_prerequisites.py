"""The DB/process boundary is mocked; no SQL, Docker or server operation runs."""
import importlib.util
import json
import subprocess
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "prerequisites", ROOT / "scripts/check-curemed-schema-prerequisites.py")
checks = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checks)


class SchemaPrerequisiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="curemed-schema-precheck-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name).resolve()
        inventory = (ROOT / checks.INVENTORY).read_bytes().replace(b"\r\n", b"\n")
        self.items = json.loads(inventory)["migrations"]
        for path in [checks.INVENTORY, *(x["path"] for x in self.items)]:
            destination = self.repo / path
            assert destination.resolve().is_relative_to(self.repo)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((ROOT / path).read_bytes().replace(b"\r\n", b"\n"))
        self.manifest = {"deployFunctions": ["_shared", "shipa-admin"],
                         "schemaPrerequisites": {"inventory": checks.INVENTORY}}
        self.rows = [{"filename": x["filename"], "checksum": x["sha256GitBytes"]} for x in self.items]
        self.reader = Mock(return_value=self.rows)

    def verify(self):
        return checks.verify_prerequisites(self.repo, self.manifest, "curemed-db", self.reader, lambda _: True)

    def test_current_release_manifest_and_migration_blobs(self):
        self.manifest = json.loads((ROOT / "ops/edge-env.manifest.example.json").read_text())
        self.assertTrue({"shipa-dispatch", "whatsapp-inbox", "order-whatsapp-dispatch"}.issubset(self.manifest["deployFunctions"]))
        self.assertTrue(self.verify()["schemaReady"])
        for item in self.items:
            raw = (ROOT / item["path"]).read_bytes().replace(b"\r\n", b"\n")
            blob = subprocess.check_output(["git", "hash-object", "--stdin"], input=raw, cwd=ROOT).decode().strip()
            self.assertEqual(item["gitBlob"], blob, item["path"])

    def test_unarmed_payment_guards_refuse_publication(self):
        with self.assertRaisesRegex(checks.SchemaReadinessError, "payment_guards_not_ready"):
            checks.verify_prerequisites(self.repo, self.manifest, "curemed-db", self.reader, lambda _: False)

    def test_exact_existing_ledger_allows_app_publication_without_activation(self):
        result = self.verify()
        self.assertTrue(result["schemaReady"])
        self.assertFalse(result["schemaActivated"])
        self.assertEqual(result["verifiedMigrations"], 25)
        self.reader.assert_called_once_with("curemed-db", [x["filename"] for x in self.items])

    def test_missing_checksum_or_ledger_row_refuses(self):
        for rows in [self.rows[:-1], [dict(x, checksum=None) for x in self.rows]]:
            with self.subTest(rows=len(rows)):
                self.reader.return_value = rows
                with self.assertRaisesRegex(checks.SchemaReadinessError, "schema_not_ready"):
                    self.verify()

    def test_mismatching_and_duplicate_rows_refuse(self):
        for rows in [[dict(x, checksum="0" * 64) for x in self.rows],
                     [self.rows[0]] * len(self.rows)]:
            self.reader.return_value = rows
            with self.assertRaises(checks.SchemaReadinessError):
                self.verify()

    def test_modified_local_sql_refuses_before_database_read(self):
        with (self.repo / self.items[0]["path"]).open("ab") as target:
            target.write(b"\n-- drift\n")
        with self.assertRaisesRegex(checks.SchemaReadinessError, "schema_source_mismatch"):
            self.verify()
        self.reader.assert_not_called()

    def test_shipa_cannot_remove_schema_declaration(self):
        del self.manifest["schemaPrerequisites"]
        with self.assertRaisesRegex(checks.SchemaReadinessError, "declaration_required"):
            self.verify()
        self.reader.assert_not_called()

    def test_legacy_manifest_without_schema_dependency_performs_no_db_operation(self):
        result = checks.verify_prerequisites(self.repo, {"deployFunctions": ["payment-health"]},
                                             "curemed-db", self.reader)
        self.assertFalse(result["required"])
        self.assertFalse(result["databaseRead"])
        self.reader.assert_not_called()

    def test_upstream_exception_cannot_expose_provider_or_sql_text(self):
        self.reader.side_effect = RuntimeError("sensitive_sql_details")
        with self.assertRaisesRegex(checks.SchemaReadinessError, "^schema_ledger_unavailable$"):
            self.verify()

    def test_native_boundary_uses_one_read_only_query_on_the_selected_db(self):
        response = SimpleNamespace(returncode=0, stdout=json.dumps(self.rows))
        with patch.object(checks.subprocess, "run", return_value=response) as process:
            self.assertEqual(checks.read_live_ledger("curemed-db", [x["filename"] for x in self.items]), self.rows)
        process.assert_called_once()
        args = process.call_args.args[0]
        self.assertEqual(args[:4], ["docker", "exec", "-i", "curemed-db"])
        self.assertTrue(args[-1].startswith("SELECT "))
        self.assertNotIn("INSERT", args[-1])
        self.assertNotIn("UPDATE", args[-1])
        self.assertEqual(process.call_args.kwargs["timeout"], 15)
        self.assertNotIn("shell", process.call_args.kwargs)

    def test_invalid_target_or_sql_filename_is_refused_before_process(self):
        with patch.object(checks.subprocess, "run") as process:
            for container, names in [("--foreign", [self.items[0]["filename"]]),
                                     ("curemed-db", ["x'); DROP TABLE orders;--"])]:
                with self.assertRaisesRegex(checks.SchemaReadinessError, "schema_target_invalid"):
                    checks.read_live_ledger(container, names)
            process.assert_not_called()

    def test_configured_database_is_the_ledger_target_not_the_default(self):
        response = SimpleNamespace(returncode=0, stdout=json.dumps(self.rows))
        with patch.dict(os.environ, {"SUPABASE_DB_USER": "curemed_operator", "SUPABASE_DB_NAME": "curemed_fixture"}):
            with patch.object(checks.subprocess, "run", return_value=response) as process:
                checks.read_live_ledger("curemed-db", [x["filename"] for x in self.items])
        command = process.call_args.args[0]
        self.assertEqual(command[command.index("-U") + 1], "curemed_operator")
        self.assertEqual(command[command.index("-d") + 1], "curemed_fixture")

    def test_ledger_output_is_bounded_in_the_query_and_stderr_is_not_buffered(self):
        response = SimpleNamespace(returncode=0, stdout=json.dumps(self.rows))
        with patch.object(checks.subprocess, "run", return_value=response) as process:
            checks.read_live_ledger("curemed-db", [x["filename"] for x in self.items])
        query = process.call_args.args[0][-1]
        self.assertIn("octet_length(checksum)", query)
        self.assertIn("octet_length(filename)", query)
        self.assertIn("LIMIT 26", query)
        self.assertEqual(process.call_args.kwargs.get("stderr"), checks.subprocess.DEVNULL)
        self.assertNotIn("capture_output", process.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
