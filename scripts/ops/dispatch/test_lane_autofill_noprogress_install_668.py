import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import install_dispatch_noprogress_fix_668 as installer
import lane_autofill_noprogress_guards as g


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class HostFixtureInstall668(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp(prefix="dispatch-668-")
        self.root = Path(self.temp)
        shutil.copy2(FIXTURES / "lane_autofill_host_668.py", self.root / "lane_autofill.py")

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_installer_patches_sort_and_skip_hooks(self):
        lane = self.root / "lane_autofill.py"
        lane.write_text(installer.inject_lane_autofill(lane.read_text()))
        text = lane.read_text()
        self.assertIn("pr_sort_key_tuple", text)
        self.assertIn("apply_noprogress_skip", text)


class HostFixtureBehavior668(unittest.TestCase):
    def test_fixture_queue_prefers_critical_over_backoff(self):
        token_old = "auto round 3 tier 1 aaa1111"
        token_new = "auto round 4 tier 1 b81de6b"
        head653 = "021b6867aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        results653 = [
            {"requeue_token": token_old, "head_sha": head653, "summary": "already at head"},
            {"requeue_token": token_old, "head_sha": head653, "summary": "already at head"},
        ]
        pr653 = {
            "number": 653,
            "created_at": 100,
            "head_sha": head653,
            "requeue_token": token_old,
        }
        pr660 = {
            "number": 660,
            "created_at": 300,
            "head_sha": "b81de6b1" * 5,
            "requeue_token": token_new,
            "labels": ["priority:top"],
        }
        ordered = g.sort_pr_rows([pr653, pr660], {653: results653, 660: []})
        self.assertEqual([row["number"] for row in ordered], [660, 653])


if __name__ == "__main__":
    unittest.main()
