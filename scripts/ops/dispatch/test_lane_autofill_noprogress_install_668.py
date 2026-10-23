import io
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
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

    def test_installer_patches_queue_builder_and_launch_skip(self):
        lane = self.root / "lane_autofill.py"
        lane.write_text(installer.inject_lane_autofill(lane.read_text()))
        text = lane.read_text()
        self.assertIn("with_noprogress_sort", text)
        self.assertIn("remember_pr_recent_results", text)
        self.assertIn("apply_noprogress_skip(item, _np_recent, log)", text)
        self.assertIn("if launch_lane(root, lane, item, dry, log):", text)
        self.assertIn("recent_for_pr", text)
        self.assertNotIn("pr_sort_key_tuple", text)

    def test_installer_dry_run_on_host_fixture(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            installer.install(self.root, dry=True, require_live_sha=False)
        out = buf.getvalue()
        self.assertIn("patch lane_autofill.py", out)
        self.assertIn("host install:", out)

    def test_install_dry_run_raises_no_system_exit(self):
        try:
            installer.install(self.root, dry=True, require_live_sha=False)
        except SystemExit as exc:
            self.fail("install dry-run must not SystemExit: %s" % exc)

    def test_installer_idempotent(self):
        lane = self.root / "lane_autofill.py"
        first = installer.inject_lane_autofill(lane.read_text())
        second = installer.inject_lane_autofill(first)
        self.assertEqual(first, second)

    def test_missing_anchor_fails_loudly(self):
        bad = "def pr_sort_key(pr, bad_checks):\n    return (0,)\n"
        with self.assertRaises(SystemExit):
            installer.inject_lane_autofill(bad)


class HostFixtureBehavior668(unittest.TestCase):
    def setUp(self):
        g.clear_recent_cache()

    def test_fixture_queue_prefers_critical_over_backoff(self):
        token_old = "auto round 3 tier 1 aaa1111"
        token_new = "auto round 4 tier 1 b81de6b"
        head653 = "021b6867aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        results653 = [
            {"pr": 653, "requeue_token": token_old, "head_sha": head653, "summary": "already at head"},
            {"pr": 653, "requeue_token": token_old, "head_sha": head653, "summary": "already at head"},
        ]
        open_prs = [
            {
                "number": 653,
                "created_at": 100,
                "head_sha": head653,
                "requeue_token": token_old,
            },
            {
                "number": 660,
                "created_at": 300,
                "head_sha": "b81de6b1" * 5,
                "requeue_token": token_new,
                "labels": ["priority:top"],
            },
        ]
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "lane_autofill_host_668_fixture", FIXTURES / "lane_autofill_host_668.py"
        )
        host = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(host)

        queue = host.build_pr_queue(open_prs, {}, results653 + [], 0, host.logline)
        ordered = g.sort_pr_rows(queue, {653: results653, 660: []})
        self.assertEqual([row["number"] for row in ordered], [660, 653])

    def test_patched_launch_skips_backoff_pr(self):
        token = "auto round 2 tier 1 cafebabe"
        head = "021b6867aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        results = [
            {"pr": 653, "requeue_token": token, "head_sha": head, "summary": "done=DONE unchanged"},
            {"pr": 653, "requeue_token": token, "head_sha": head, "summary": "done=DONE unchanged"},
        ]
        lane_path = FIXTURES / "lane_autofill_host_668.py"
        text = installer.inject_lane_autofill(lane_path.read_text())
        mod_name = "lane_autofill_host_668_patched_%s" % id(self)
        mod_path = Path(tempfile.gettempdir()) / (mod_name + ".py")
        mod_path.write_text(text)
        if mod_name in sys.modules:
            del sys.modules[mod_name]
        import importlib.util

        dispatch_dir = str(Path(__file__).resolve().parent)
        if dispatch_dir not in sys.path:
            sys.path.insert(0, dispatch_dir)
        spec = importlib.util.spec_from_file_location(mod_name, mod_path)
        host = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(host)
        g.clear_recent_cache()
        open_prs = [{"number": 653, "created_at": 1, "head_sha": head, "requeue_token": token}]
        queue = host.build_pr_queue(open_prs, {}, results, 0, host.logline)
        logs = []

        def log(msg, dry=False):
            logs.append(msg)

        launched = host.simulate_autofill_pass("/tmp", ["lane-a"], queue, False, log)
        self.assertEqual(launched, [])
        self.assertEqual(len(logs), 1)
        self.assertIn("skip #653", logs[0])
        self.assertIn("no-progress backoff", logs[0])


if __name__ == "__main__":
    unittest.main()
