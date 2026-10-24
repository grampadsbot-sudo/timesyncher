import io
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import install_dispatch_hold_after_fix_685 as installer


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class HostFixtureInstall(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp(prefix="dispatch-685-")
        self.root = Path(self.temp)
        shutil.copy2(FIXTURES / "idle_capacity_host_685.py", self.root / "idle_capacity.py")

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_installer_patches_delegate(self):
        idle = self.root / "idle_capacity.py"
        idle.write_text(installer.inject_extra_hold_removals(idle.read_text()))
        text = idle.read_text()
        self.assertIn("hold_after_guards.extra_hold_removals(", text)
        self.assertNotIn("out.append((lab, \"no named open blocker\"))", text)

    def test_installer_dry_run_succeeds_on_host_fixture(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            installer.install(self.root, dry=True, require_live_sha=False)
        out = buf.getvalue()
        self.assertIn("hold_after_guards.py", out)
        self.assertIn("copy ", out)
        self.assertIn("patch idle_capacity.py", out)
        self.assertIn("sha256 hold_after_guards.py", out)

    def test_installer_idempotent_second_run(self):
        idle = self.root / "idle_capacity.py"
        first = installer.inject_extra_hold_removals(idle.read_text())
        second = installer.inject_extra_hold_removals(first)
        self.assertEqual(first, second)

    def test_require_live_sha_rejects_fixture(self):
        with self.assertRaises(SystemExit):
            installer.install(self.root, dry=True, require_live_sha=True)


if __name__ == "__main__":
    unittest.main()
