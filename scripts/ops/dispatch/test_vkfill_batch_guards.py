import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vkfill_batch_guards as g


class AlreadyPushedVoid(unittest.TestCase):
    def test_incident_653_remote_missing_held_sha(self):
        held = "43dcbeae8fe9097bf2a4e63c0e64655ff7509c43"
        remote_tip = "6452bca8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        lines = ["%s\trefs/heads/vkfill/641-20261022210748" % remote_tip]
        self.assertFalse(
            g.may_void_held_as_alreadypushed(
                held,
                "refs/heads/vkfill/641-20261022210748",
                lines,
                local_tip_sha=held,
                last_push_recorded_sha=held,
            )
        )

    def test_void_only_after_ls_remote_confirms_held(self):
        held = "43dcbeae8fe9097bf2a4e63c0e64655ff7509c43"
        lines = ["%s\trefs/heads/vkfill/641-20261022210748" % held]
        self.assertTrue(
            g.may_void_held_as_alreadypushed(
                held,
                "vkfill/641-20261022210748",
                lines,
            )
        )

    def test_remote_branch_contains_held_sha_prefix(self):
        held = "43dcbeae"
        lines = ["43dcbeae8fe9097bf2a4e63c0e64655ff7509c43\trefs/heads/vkfill/test"]
        self.assertTrue(g.remote_branch_contains_held_sha(lines, "vkfill/test", held))


class QuotaSkipAndStall(unittest.TestCase):
    def test_overdue_held_forces_batch_push_despite_quota_skip(self):
        now = 1_700_000_000.0
        held = [{"pr": 653, "push_due": now - 120}]
        self.assertTrue(
            g.autofill_must_run_batch_push("skipped low GitHub quota", held, now)
        )

    def test_quota_skip_without_overdue_held(self):
        now = 1_700_000_000.0
        held = [{"pr": 653, "push_due": now + 3600}]
        self.assertFalse(
            g.autofill_must_run_batch_push("skipped low GitHub quota", held, now)
        )

    def test_stall_alarm_reports_held_push_overdue(self):
        now = 2_000_000_000.0
        held = [
            {
                "n": 653,
                "push_due": now - 1,
                "branch": "vkfill/641-20261022210748",
                "sha": "43dcbeae8fe9097bf2a4e63c0e64655ff7509c43",
            }
        ]
        reason = g.stall_alarm_reason(held, now, generic_reason="PR stalled 45m")
        self.assertEqual(
            reason,
            "held, push overdue vkfill/641-20261022210748 43dcbeae8fe9097bf2a4e63c0e64655ff7509c43",
        )

    def test_publish_before_quota_skip_without_log_line(self):
        now = 1_700_000_000.0
        held = [{"pr": 653, "push_due": now - 1}]
        self.assertTrue(g.autofill_should_publish_before_quota_skip(held, now))


if __name__ == "__main__":
    unittest.main()
