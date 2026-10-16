import calendar, subprocess, time, unittest
from unittest.mock import patch
import dr_scorecard as sc
import tsv_stuck_check as watcher

PAGE = """---
type: concept
title: Dr scorecard (points per dr)
---

# Dr scorecard

## claude-code
Total: 0 (since 2026-10-14)

- 2026-10-14 10:11 PT | scorecard created | 0 | v1.8.0 scorecard opened.

## dr-eggbot
Total: -4 (since 2026-10-14)

- 2026-10-14 11:00 PT | PR #300 | -2 | logged-only ring
- 2026-10-14 11:10 PT | PR #300 | -2 | logged-only ring
"""

def ts(y, mo, d, h, mi):
    return calendar.timegm((y, mo, d, h, mi, 0, 0, 0, 0))

class FakeGbrain:
    """Stands in for the gbrain CLI: get returns the stored page with a banner on stderr, put stores stdin."""
    def __init__(self, text, put_rc=0, store_on_put=True):
        self.text, self.put_rc, self.store_on_put, self.puts = text, put_rc, store_on_put, []
    def __call__(self, args, stdin=None):
        if args[0] == "get":
            return subprocess.CompletedProcess(args, 0, stdout=self.text, stderr="UPGRADE_AVAILABLE 1 -> 2\n")
        self.puts.append((args, stdin))
        if self.put_rc == 0 and self.store_on_put: self.text = stdin
        return subprocess.CompletedProcess(args, self.put_rc, stdout="", stderr="")

class Parse(unittest.TestCase):
    def test_body_drops_upgrade_banner_before_frontmatter(self):
        self.assertTrue(sc.body_of("UPGRADE_AVAILABLE\n" + PAGE).startswith("---\n"))

    def test_totals_per_section(self):
        self.assertEqual(sc.parse_totals(PAGE), {"claude-code": 0, "dr-eggbot": -4})

    def test_section_without_total_is_absent_not_zero(self):
        self.assertEqual(sc.parse_totals("## claude-code\n- no total line\n"), {})

class Morning(unittest.TestCase):
    def test_line_shows_both_drs(self):
        with patch.object(sc, "_run", FakeGbrain(PAGE)):
            self.assertEqual(sc.morning_line(), "Dr scores: claude-code 0, dr-eggbot -4")

    def test_unreadable_page_is_unknown_never_zero(self):
        def boom(args, stdin=None): return subprocess.CompletedProcess(args, 1, stdout="", stderr="")
        with patch.object(sc, "_run", boom):
            line = sc.morning_line()
        self.assertEqual(line, "Dr scores: unknown (gbrain get rc1)")
        self.assertNotIn(" 0", line)

    def test_missing_dr_section_is_unknown(self):
        with patch.object(sc, "_run", FakeGbrain("---\ntitle: x\n---\n## claude-code\nTotal: 3\n")):
            self.assertEqual(sc.morning_line(), "Dr scores: unknown (no total for dr-eggbot)")

class Miss(unittest.TestCase):
    def test_miss_appends_event_and_moves_total_down_two(self):
        fake = FakeGbrain(PAGE)
        with patch.object(sc, "_run", fake):
            total = sc.record_miss("claude-code", "PR #336", ts(2026, 10, 14, 18, 30))
        self.assertEqual(total, -2)
        text = fake.puts[0][1]
        self.assertEqual(fake.puts[0][0][-1], "--force")
        self.assertIn("Total: -2 (since 2026-10-14)", text)
        self.assertIn("- 2026-10-14 11:30 PT | PR #336 | -2 | logged-only ring", text)
        # the event lands inside claude-code's section, before dr-eggbot's heading
        self.assertLess(text.index("logged-only ring"), text.index("## dr-eggbot"))
        # dr-eggbot untouched
        self.assertIn("Total: -4 (since 2026-10-14)", text)

    def test_unknown_owner_gets_its_own_section(self):
        fake = FakeGbrain(PAGE)
        with patch.object(sc, "_run", fake):
            total = sc.record_miss("unknown", "issue #389", ts(2026, 10, 14, 18, 30))
        self.assertEqual(total, -2)
        text = fake.puts[0][1]
        self.assertIn("## unknown\nTotal: -2", text)
        self.assertIn("issue #389 | -2 | logged-only ring", text)

    def test_failed_write_raises(self):
        with patch.object(sc, "_run", FakeGbrain(PAGE, put_rc=1)):
            with self.assertRaises(RuntimeError):
                sc.record_miss("claude-code", "PR #1", ts(2026, 10, 14, 18, 30))

    def test_write_not_visible_on_reread_raises(self):
        with patch.object(sc, "_run", FakeGbrain(PAGE, store_on_put=False)):
            with self.assertRaises(RuntimeError):
                sc.record_miss("claude-code", "PR #1", ts(2026, 10, 14, 18, 30))

class Owner(unittest.TestCase):
    def test_single_dr_on_owner_line(self):
        a = "- PR #336: Owner: claude-code, next action ...\n"
        self.assertEqual(sc.owner_of(336, a), "claude-code")

    def test_issue_number_does_not_match_longer_number(self):
        a = "- PR #3360: Owner: claude-code\n"
        self.assertEqual(sc.owner_of(336, a), "unknown")

    def test_two_drs_is_ambiguous(self):
        a = "- PR #336 Owner: claude-code; dr eggbot also owner\n"
        self.assertEqual(sc.owner_of(336, a), "unknown")

    def test_no_owner_word_is_unknown(self):
        self.assertEqual(sc.owner_of(336, "- PR #336 active, claude-code managing dr\n"), "unknown")

class Escalation(unittest.TestCase):
    def test_three_misses_escalate(self):
        self.assertFalse(sc.should_escalate(0))
        self.assertFalse(sc.should_escalate(2))
        self.assertTrue(sc.should_escalate(3))
        self.assertFalse(sc.should_escalate(4))
        self.assertTrue(sc.should_escalate(6))

class Stuck(unittest.TestCase):
    class GH:
        def __init__(self, comments=(), events=()): self.c, self.e = list(comments), list(events)
        def pages(self, path, key=None): return self.c if path.endswith("/comments") else self.e

    def setUp(self):
        watcher.INFO.clear(); watcher.INFO["pr336"] = {"who": "VK PR #336"}
        watcher.ASSESS.clear(); watcher.ASSESS["text"] = "- PR #336 Owner: claude-code\n"
        self.since = ts(2026, 10, 14, 17, 0)
        self.s = {"first": 0, "last_ring": self.since, "escalated": 0}

    def iso(self, t): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))

    def test_no_dr_post_since_state_counts_a_miss_and_scores_it(self):
        recorded = []
        with patch.object(watcher, "record_miss", lambda dr, label, now: recorded.append((dr, label)) or -2), \
             patch.object(watcher, "ring_grok", lambda msg, dry: recorded.append("grok") or "ok"):
            out = watcher.score_miss("pr336", 336, self.s, 0, self.since, self.since + 600, False)
        self.assertEqual(out, "score: claude-code -2")
        self.assertEqual(self.s["misses"], 1)
        self.assertEqual(recorded, [("claude-code", "VK PR #336")])

    def test_post_since_ring_is_not_a_miss_and_resets_count(self):
        self.s["misses"] = 2
        gh = self.GH(comments=[{"created_at": self.iso(self.since + 60)}])
        with patch.object(watcher, "record_miss", lambda *a: self.fail("should not score")):
            self.assertIsNone(watcher.score_miss("pr336", 336, self.s, self.since + 60, self.since, self.since + 600, False))
        self.assertEqual(self.s["misses"], 0)

    def test_comment_before_ring_does_not_count_as_post(self):
        gh = self.GH(comments=[{"created_at": self.iso(self.since - 60)}])
        with patch.object(watcher, "record_miss", lambda *a: -2), patch.object(watcher, "ring_grok", lambda *a: "ok"):
            self.assertEqual(watcher.score_miss("pr336", 336, self.s, self.since - 60, self.since, self.since + 600, False), "score: claude-code -2")

    def test_scorecard_does_not_send_independent_tincan_escalation(self):
        self.s["misses"] = 2
        msgs = []
        with patch.object(watcher, "record_miss", lambda *a: -6), \
             patch.object(watcher, "ring_grok", lambda msg, dry: msgs.append(msg) or "ok"):
            out = watcher.score_miss("pr336", 336, self.s, 0, self.since, self.since + 1800, False)
        self.assertEqual(out, "score: claude-code -6")
        self.assertEqual(msgs, [])

if __name__ == "__main__":
    unittest.main()
