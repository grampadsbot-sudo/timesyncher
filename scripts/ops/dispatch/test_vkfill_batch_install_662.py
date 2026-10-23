import hashlib
import io
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import install_dispatch_vkfill_batch_fix_662 as installer
import vkfill_batch_guards as g


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class HostFixtureInstall(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp(prefix="dispatch-662-")
        self.root = Path(self.temp)
        shutil.copy2(FIXTURES / "lane_autofill_host_662.py", self.root / "lane_autofill.py")
        shutil.copy2(FIXTURES / "tsv_stall_alarm_host_662.py", self.root / "tsv_stall_alarm.py")

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_installer_patches_live_anchors_without_retire_hook(self):
        lane = self.root / "lane_autofill.py"
        stall = self.root / "tsv_stall_alarm.py"
        lane_text, notes = installer.inject_lane_autofill(lane.read_text())
        lane.write_text(lane_text)
        stall.write_text(installer.inject_stall_alarm(stall.read_text()))
        text = lane.read_text()
        self.assertNotIn("may_void_held_as_alreadypushed", text)
        self.assertTrue(
            any("skip-retire-hook" in note for note in notes),
            notes,
        )
        quota_pos = text.find("skipped low GitHub quota")
        publish_pos = text.rfind("publish_vkfill_batch(gh, dry)", 0, quota_pos)
        self.assertNotEqual(publish_pos, -1)
        stall_text = stall.read_text()
        self.assertIn("load_vkfill_held_entries()", stall_text)
        self.assertIn("stall_alarm_reason", stall_text)

    def test_installer_dry_run_succeeds_on_host_fixture(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            installer.install(self.root, dry=True)
        out = buf.getvalue()
        self.assertIn("patch lane_autofill.py", out)
        self.assertIn("patch tsv_stall_alarm.py", out)
        self.assertIn("skip-retire-hook", out)
        self.assertIn("sha256 vkfill_batch_guards.py", out)
        self.assertIn("sha256 dispatch_stall_guards.py", out)

    def test_installer_idempotent_second_run(self):
        lane = self.root / "lane_autofill.py"
        stall = self.root / "tsv_stall_alarm.py"
        first_lane, _ = installer.inject_lane_autofill(lane.read_text())
        first_stall = installer.inject_stall_alarm(stall.read_text())
        second_lane, second_notes = installer.inject_lane_autofill(first_lane)
        second_stall = installer.inject_stall_alarm(first_stall)
        self.assertEqual(first_lane, second_lane)
        self.assertEqual(first_stall, second_stall)
        self.assertEqual(second_notes, [])
        self.assertIn("VKFILL_BATCH_662_SKIP_RETIRE_HOOK", first_lane)


class HostFixtureBehavior(unittest.TestCase):
    def test_quota_skip_still_publishes_overdue_held(self):
        now = 1_700_000_000.0
        held = [
            {
                "pr": 653,
                "push_due": now - 60,
                "branch": "vkfill/641-20261022210748",
                "sha": "43dcbeae8fe9097bf2a4e63c0e64655ff7509c43",
            }
        ]
        self.assertTrue(g.autofill_should_publish_before_quota_skip(held, now))

    def test_void_alreadypushed_marker_lint(self):
        held = "43dcbeae8fe9097bf2a4e63c0e64655ff7509c43"
        remote = "6452bca8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        lines = ["%s\trefs/heads/vkfill/641-20261022210748" % remote]
        name = "653.void-20261023-0112-alreadypushed"
        payload = {
            "ref": "vkfill/641-20261022210748",
            "tip": "vkfill/641-20261022210748",
            "sha": held,
        }
        violations = g.scan_void_alreadypushed_markers([(name, payload)], lines)
        self.assertEqual(len(violations), 1)
        self.assertIn("653.void-20261023-0112-alreadypushed", violations[0])
        self.assertIn(held[:7], violations[0])


if __name__ == "__main__":
    unittest.main()
