import io
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import install_gateb_coverage_argv_fix_711 as installer

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class HostFixtureInstall(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp(prefix="dispatch-711-")
        self.dispatch_root = Path(self.temp) / "tsv-dispatch"
        self.gateb_root = Path(self.temp) / "tsv-gateb"
        self.dispatch_root.mkdir()
        self.gateb_root.mkdir()
        shutil.copy2(
            FIXTURES / "tsv_dispatch_host_711_coverage_argv.py",
            self.dispatch_root / "tsv_dispatch.py",
        )

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_inject_replaces_star_argv(self):
        text = (self.dispatch_root / "tsv_dispatch.py").read_text()
        patched, notes = installer.inject_tsv_dispatch(text)
        self.assertNotIn("UI_PATHS, *paths", patched)
        self.assertIn("run_ui_paths_classifier", patched)
        self.assertEqual(notes, [])

    def test_installer_dry_run(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            installer.install(self.dispatch_root, self.gateb_root, dry=True)
        out = buf.getvalue()
        self.assertIn("sha256 gateb_coverage_step.py", out)
        self.assertIn("sha256 ui_paths.py", out)
        self.assertIn("patch tsv_dispatch.py", out)


if __name__ == "__main__":
    unittest.main()
