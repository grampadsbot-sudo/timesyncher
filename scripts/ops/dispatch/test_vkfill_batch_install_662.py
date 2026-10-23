import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import install_dispatch_vkfill_batch_fix_662 as installer
import vkfill_batch_guards as g


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class HostFixtureInstall(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp(prefix="dispatch-662-")
        self.root = Path(self.temp)
        shutil.copy2(FIXTURES / "lane_autofill_host_662.py", self.root / "lane_autofill.py")
        shutil.copy2(FIXTURES / "tsv_stall_alarm_host_662.py", self.root / "tsv_stall_alarm.py")

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_installer_patches_live_anchors(self):
        lane = self.root / "lane_autofill.py"
        stall = self.root / "tsv_stall_alarm.py"
        lane.write_text(installer.inject_lane_autofill(lane.read_text()))
        stall.write_text(installer.inject_stall_alarm(stall.read_text()))
        text = lane.read_text()
        self.assertIn("may_void_held_as_alreadypushed", text)
        self.assertIn("publish_vkfill_batch(gh, dry)", text)
        self.assertIn('logline("lane-autofill: skipped low GitHub quota"', text)
        stall_text = stall.read_text()
        self.assertIn("load_vkfill_held_entries()", stall_text)
        self.assertIn("stall_alarm_reason", stall_text)


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
        self.assertTrue(
            g.void_alreadypushed_marker_invalid(
                name,
                held,
                "vkfill/641-20261022210748",
                lines,
            )
        )


if __name__ == "__main__":
    unittest.main()
