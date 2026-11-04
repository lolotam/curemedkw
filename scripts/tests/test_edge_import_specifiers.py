"""Edge function sources must not depend on a local import map.

The self-hosted edge runtime loads each function without the repository's
deno.shipa.json import map, so a bare specifier such as ``"zod"`` boots
locally but fails on the server with "Relative import path ... not prefixed".
Every non-test import must be relative, ``npm:``, ``jsr:``, ``node:`` or a URL.
"""

import re
import unittest
from pathlib import Path

FUNCTIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "functions"
IMPORT_PATTERN = re.compile(
    r"""(?:^|\s)(?:import|export)\b[^"';]*?\bfrom\s+["']([^"']+)["']"""
    r"""|\bimport\s*\(\s*["']([^"']+)["']\s*\)"""
    r"""|^\s*import\s+["']([^"']+)["']""",
    re.MULTILINE,
)
ALLOWED_PREFIXES = ("./", "../", "/", "npm:", "jsr:", "node:", "https://", "http://")


def is_test_source(path: Path) -> bool:
    return "_tests" in path.parts or path.name.endswith(".test.ts")


class EdgeImportSpecifierTest(unittest.TestCase):
    def test_runtime_sources_use_self_contained_specifiers(self) -> None:
        offenders = []
        for path in sorted(FUNCTIONS_DIR.rglob("*.ts")):
            if is_test_source(path):
                continue
            text = path.read_text(encoding="utf-8")
            for match in IMPORT_PATTERN.finditer(text):
                specifier = next(group for group in match.groups() if group)
                if not specifier.startswith(ALLOWED_PREFIXES):
                    offenders.append(f"{path.relative_to(FUNCTIONS_DIR)}: {specifier}")
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
