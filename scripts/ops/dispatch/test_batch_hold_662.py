"""Focused tests for batch-hold-662-runtime.patch (vkfill-held low-quota publish + stall alarm)."""
import importlib.util
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

_DISPATCH = os.path.expanduser("~/tsv-dispatch")
_PATCH = pathlib.Path(__file__).with_name("batch-hold-662-runtime.patch")


def _load_module(name, path):
    if _DISPATCH not in sys.path:
        sys.path.insert(0, _DISPATCH)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class BatchHold662(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temporary = tempfile.TemporaryDirectory(prefix="batch662-proof-")
        cls.addClassCleanup(cls._temporary.cleanup)
        proof = pathlib.Path(cls._temporary.name)
        root = pathlib.Path(os.environ.get("BATCH662_RUNTIME_ROOT", _DISPATCH))
        for name in ("lane_autofill.py", "tsv_stall_alarm.py"):
            shutil.copy2(root / name, proof / name)
        result = subprocess.run(
            ["patch", "--batch", "--fuzz=0", "-p0", "-i", str(_PATCH.resolve())],
            cwd=proof, capture_output=True, text=True,
        )
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)
        cls.la = _load_module("lane_autofill_662", str(proof / "lane_autofill.py"))
        cls.sa = _load_module("tsv_stall_alarm_662", str(proof / "tsv_stall_alarm.py"))

    def test_full_hash_collision_and_invalid_hashes(self):
        held = "1234567" + "a" * 33
        for module, name in [(self.la, "_remote_tip_matches_held"), (self.sa, "_remote_tip_has_held_sha")]:
            check = getattr(module, name)
            self.assertFalse(check(["1234567" + "b" * 33 + " refs/heads/vkfill/653"], held))
            self.assertFalse(check([held + " refs/heads/vkfill/653"], held[:7]))
            self.assertFalse(check([held[:7] + " refs/heads/vkfill/653"], held))
            self.assertFalse(check([held + " refs/heads/vkfill/wrong"], held, "vkfill/653"))
            self.assertTrue(check([held + " refs/heads/vkfill/653"], held, "vkfill/653"))

    def test_actual_void_file_without_numeric_parent(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "653.void-20261023-0112-alreadypushed"
            held = "1234567" + "a" * 33
            path.write_text("vkfill/653 " + held + " " + "1234567" + "b" * 33 + "\n")
            marker = self.sa._read_vkfill_held_marker_file(str(path))
            self.assertEqual(marker["number"], 653)
            self.assertEqual(marker["tip"], held)
            self.assertIsNone(self.sa._read_vkfill_held_marker_file(str(path.with_name("653.void-x-held"))))
            with patch.object(self.sa, "VKFILL_HELD_DIR", tmp), patch.object(
                self.sa, "_ls_remote_vkfill_lines", return_value=["1234567" + "b" * 33 + " refs/heads/vkfill/653"]
            ):
                out = self.sa.vkfill_held_stall_checks(time.time(), dry=True)
            self.assertEqual(len(out), 1)
            self.assertIn("unverified", out[0])
            self.assertTrue(path.is_file())

    def test_clear_compares_result_tip_not_old_remote_sha(self):
        old = "a" * 40
        result = "b" * 40
        marker = dict(number=653, ref="vkfill/653", tip=result, sha=old)
        with patch.object(self.la, "_git_ls_remote_lines", return_value=[old + " refs/heads/vkfill/653"]), patch.object(self.la, "vkfill_mark") as clear:
            self.assertFalse(self.la.maybe_clear_vkfill_held_remote_match(marker, False, lambda m: None))
            clear.assert_not_called()
        with patch.object(self.la, "_git_ls_remote_lines", return_value=[result + " refs/heads/vkfill/653"]), patch.object(self.la, "vkfill_mark") as clear:
            self.assertTrue(self.la.maybe_clear_vkfill_held_remote_match(marker, False, lambda m: None))
            clear.assert_called_once()

    def test_remote_read_has_explicit_repository_from_any_cwd(self):
        for module, name in [(self.la, "_git_ls_remote_lines"), (self.sa, "_ls_remote_vkfill_lines")]:
            with patch("subprocess.run", return_value=Mock(returncode=0, stdout="")) as run:
                getattr(module, name)("vkfill/653")
            args = run.call_args.args[0]
            self.assertEqual(args[2], "https://github.com/" + module.REPO + ".git")
            self.assertEqual(args[3], "refs/heads/vkfill/653")

    def test_remote_match_requires_ls_remote_prefix(self):
        held = "43dcbeae8fe9097bf2a4e63c0e64655ff7509c43"
        lines = ["%s\trefs/heads/vkfill/641-20261022210748" % held]
        self.assertTrue(self.la._remote_tip_matches_held(lines, held))
        mismatch = ["6452bca8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/heads/vkfill/641-20261022210748"]
        self.assertFalse(self.la._remote_tip_matches_held(mismatch, held))

    def test_held_push_due_respects_batch_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = os.path.join(tmp, "dispatch")
            held_dir = os.path.join(root, "auto-filler", "vkfill-held")
            os.makedirs(held_dir)
            ref = "vkfill/653-test"
            path = os.path.join(held_dir, "653")
            with open(path, "w") as fh:
                fh.write("%s tipsha deadbeef\n" % ref)
            pushes = os.path.join(root, "auto-filler", "vkfill-last-push.json")
            os.makedirs(os.path.dirname(pushes), exist_ok=True)
            marker = self.la.read_vkfill_held_marker(653, root=root)
            old_d, old_push = self.la.D, self.la.VKFILL_PUSHES_F
            self.la.D = root
            self.la.VKFILL_PUSHES_F = pushes
            try:
                with open(pushes, "w") as fh:
                    fh.write('{"%s": %s}' % (ref, time.time()))
                self.assertFalse(self.la.vkfill_held_push_due(marker, time.time(), root=root))
                with open(pushes, "w") as fh:
                    fh.write('{"%s": %s}' % (ref, time.time() - 4000))
                self.assertTrue(self.la.vkfill_held_push_due(marker, time.time(), root=root))
            finally:
                self.la.D = old_d
                self.la.VKFILL_PUSHES_F = old_push

    def test_low_quota_publishes_only_due_held(self):
        calls = []

        def fake_unpublished(results, root, dry, now, log, gh=None):
            calls.append([r["number"] for r in results])

        held = dict(number=660, ref="vkfill/660-x", tip="tip", sha="sha660", path="/x")
        result_due = dict(number=660, path="/r")
        result_other = dict(number=661, path="/r2")

        with patch.object(self.la, "iter_vkfill_held_markers", return_value=[held]), patch.object(
            self.la, "completed_results", return_value=[result_due, result_other]
        ), patch.object(self.la, "maybe_clear_vkfill_held_remote_match", return_value=False), patch.object(
            self.la, "vkfill_held_push_due", side_effect=lambda m, *a, **k: m["number"] == 660
        ), patch.object(self.la, "result_worktree", return_value="/wt"), patch.object(
            self.la, "unpublished_results", side_effect=fake_unpublished
        ):
            self.la.publish_due_held_on_low_quota(Mock(), time.time(), False, lambda m: None, root="/d")
        self.assertEqual(calls, [[660]])

    def test_low_quota_skips_nondue_and_unheld(self):
        calls = []

        def fake_unpublished(results, root, dry, now, log, gh=None):
            calls.append([r["number"] for r in results])

        held = dict(number=660, ref="vkfill/660-x", tip="tip", sha="sha660", path="/x")
        with patch.object(self.la, "iter_vkfill_held_markers", return_value=[held]), patch.object(
            self.la, "completed_results", return_value=[dict(number=661, path="/r")]
        ), patch.object(self.la, "unpublished_results", side_effect=fake_unpublished):
            self.la.publish_due_held_on_low_quota(Mock(), time.time(), False, lambda m: None, root="/d")
        self.assertEqual(calls, [])

    def test_remote_match_clears_held_without_publish(self):
        cleared = []

        def fake_clear(marker, dry, log, root="/d"):
            cleared.append(marker["number"])
            return True

        held = dict(number=653, ref="vkfill/653", tip="t", sha="s", path="/p")
        with patch.object(self.la, "iter_vkfill_held_markers", return_value=[held]), patch.object(
            self.la, "completed_results", return_value=[dict(number=653, path="/r")]
        ), patch.object(self.la, "maybe_clear_vkfill_held_remote_match", side_effect=fake_clear), patch.object(
            self.la, "unpublished_results", side_effect=lambda *a, **k: (_ for _ in ()).throw(AssertionError("publish"))
        ):
            self.la.publish_due_held_on_low_quota(Mock(), time.time(), False, lambda m: None, root="/d")
        self.assertEqual(cleared, [653])

    def test_stall_reports_overdue_held(self):
        now = time.time()
        marker = dict(number=653, ref="vkfill/653-x", tip="t", sha="deadbeef", path="/p", name="653")
        with patch.object(self.sa, "os") as mock_os:
            mock_os.path.isdir.return_value = True
            mock_os.listdir.return_value = ["653"]
            mock_os.path.join.side_effect = os.path.join
            with patch.object(self.sa, "_read_vkfill_held_marker_file", return_value=marker), patch.object(
                self.sa, "_ls_remote_vkfill_lines", return_value=None
            ), patch.object(self.sa, "vkfill_held_push_overdue", return_value=True):
                out = self.sa.vkfill_held_stall_checks(now, dry=True)
        self.assertEqual(1, len(out))
        self.assertIn("held, push overdue", out[0])
        self.assertIn("653", out[0])

    def test_void_alreadypushed_not_cleared_on_mismatch(self):
        now = time.time()
        marker = dict(number=653, ref="vkfill/653-x", tip="t", sha="deadbeef", path="/p", name="653")
        lines = ["aaaaaaaabbbbbbbbccccccccddddddddeeeeeeee\trefs/heads/vkfill/653-x"]
        with patch.object(self.sa, "os") as mock_os:
            mock_os.path.isdir.return_value = True
            mock_os.listdir.return_value = ["653.void-stamp-alreadypushed"]
            mock_os.path.join.side_effect = os.path.join
            with patch.object(self.sa, "_read_vkfill_held_marker_file", return_value=marker), patch.object(
                self.sa, "_ls_remote_vkfill_lines", return_value=lines
            ):
                out = self.sa.vkfill_held_stall_checks(now, dry=True)
        self.assertTrue(any("unverified" in x for x in out))


if __name__ == "__main__":
    unittest.main()
