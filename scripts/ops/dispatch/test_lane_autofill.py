import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lane_autofill_noprogress_guards as g


def _row(number, created, head, token, labels=None):
    return {
        "number": number,
        "created_at": created,
        "head_sha": head,
        "requeue_token": token,
        "labels": labels or [],
    }


class NoProgressBackoff668(unittest.TestCase):
    def test_critical_waiting_pr_sorts_before_backoff_stuck_prs(self):
        token_old = "auto round 3 tier 1 aaa1111"
        token_new = "auto round 4 tier 1 b81de6b"
        head653 = "021b6867aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        head569 = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        results653 = [
            {
                "requeue_token": token_old,
                "head_sha": head653,
                "summary": "done=DONE PUBLISH: exists PR #653 already at 021b6867",
            },
            {
                "requeue_token": token_old,
                "head_sha": head653,
                "summary": "done=DONE PUBLISH: exists PR #653 already at 021b6867",
            },
        ]
        results569 = [
            {
                "requeue_token": token_old,
                "head_sha": head569,
                "summary": "ROWCHECK-GIVEUP DONE withheld, NOT published",
                "rc": 5,
            },
            {
                "requeue_token": token_old,
                "head_sha": head569,
                "summary": "ROWCHECK-GIVEUP DONE withheld, NOT published",
                "rc": 5,
            },
        ]
        pr653 = _row(653, 100, head653, token_old)
        pr569 = _row(569, 200, head569, token_old)
        pr660 = _row(660, 300, "b81de6b1" * 5, token_new, labels=["priority:top"])
        ordered = g.sort_pr_rows(
            [pr653, pr569, pr660],
            {653: results653, 569: results569, 660: []},
        )
        self.assertEqual([row["number"] for row in ordered], [660, 653, 569])
        self.assertTrue(g.noprogress_backoff_active(pr653, results653))
        self.assertFalse(g.noprogress_backoff_active(pr660, []))

    def test_backoff_pr_skipped_with_one_log_line(self):
        token = "auto round 2 tier 1 cafebabe"
        head = "021b6867aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        results = [
            {"requeue_token": token, "head_sha": head, "summary": "done=DONE unchanged"},
            {"requeue_token": token, "head_sha": head, "summary": "done=DONE unchanged"},
        ]
        row = _row(653, 100, head, token)
        logs = []
        self.assertTrue(g.apply_noprogress_skip(row, results, logs.append))
        self.assertEqual(len(logs), 1)
        self.assertIn("skip #653", logs[0])
        self.assertIn("no-progress backoff", logs[0])

    def test_head_change_clears_backoff_and_allows_launch(self):
        token = "auto round 2 tier 1 cafebabe"
        old_head = "021b6867aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        new_head = "11111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        results = [
            {"requeue_token": token, "head_sha": old_head, "summary": "done=DONE unchanged"},
            {"requeue_token": token, "head_sha": old_head, "summary": "done=DONE unchanged"},
        ]
        row = _row(653, 100, new_head, token)
        self.assertFalse(g.noprogress_backoff_active(row, results))
        skip, _reason = g.should_skip_launch(row, results)
        self.assertFalse(skip)


if __name__ == "__main__":
    unittest.main()
