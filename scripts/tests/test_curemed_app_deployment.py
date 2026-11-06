"""Release declarations/order only: no shell, SQL, server or provider executes."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class AppDeploymentContractTests(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((ROOT / "ops/edge-env.manifest.example.json").read_text())

    def test_shipa_handler_is_declared_for_deployment_with_server_key(self):
        functions = {item["name"]: item for item in self.manifest["edgeFunctions"]}
        self.assertIn("shipa-admin", functions)
        self.assertIn("shipa-admin", self.manifest["deployFunctions"])
        self.assertIn("INTEGRATIONS_ENCRYPTION_KEY_V1", functions["shipa-admin"]["requiredSecrets"])
        self.assertIn("INTEGRATIONS_ENCRYPTION_KEY_V1", self.manifest["requiredSecrets"])
        self.assertNotIn("main", self.manifest["deployFunctions"])

    def test_schema_inventory_is_required_before_any_environment_or_function_change(self):
        lines = (ROOT / "scripts/supabase-post-deploy.sh").read_text().splitlines()
        self.assertIn("validate_schema_prerequisites", lines,
                      "No schema readiness gate exists before dependent application publication")
        gate = lines.index("validate_schema_prerequisites")
        for mutation in ["generate_runtime_env", "ensure_compose_env_values", "inject_compose_refs",
                         "persist_kong_cors", "deploy_functions", "apply_migrations"]:
            self.assertLess(gate, lines.index(mutation))
        self.assertEqual(self.manifest.get("schemaPrerequisites", {}).get("inventory"),
                         "docs/releases/curemed-schema-20261106b.json")


if __name__ == "__main__":
    unittest.main()
