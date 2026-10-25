"""#567 regressions: an overdue host handback gets one managing-dr acceptance action, never a coder/lane/Gate B retry.
Synthetic objects and a temporary dispatch root only; no network, no live state, no notifications."""
import io
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests"))
import dispatch_root
dispatch_root.insert_path()

RINGS = []
sys.modules["pr_issue_links"] = types.SimpleNamespace(issue_pr_map=lambda prs: {}, clear_issue_ready=lambda g, n: None)
sys.modules["bell_gate"] = types.SimpleNamespace(ring=lambda *a, **k: RINGS.append((a, k)) or "ok")

import host_handback_review as HR
import tsv_stall_alarm as A

HOST = {"login": "grampadsbot-sudo"}
ACCEPT_BODY = "Closes #562\n\nHost acceptance: NOT RUN (paired capture pending).\n"


def read(path):
    with open(path) as fh:
        return fh.read()


def write(path, text):
    with open(path, "w") as fh:
        fh.write(text)


def pr(n, draft=False, body="", labels=(), user=HOST):
    return {"number": n, "draft": draft, "body": body, "user": user, "html_url": "https://github.com/x/pull/%d" % n,
            "head": {"sha": "%040x" % n}, "base": {"ref": "migrate/trek-source"}, "title": "PR %d" % n,
            "labels": [{"name": l} for l in labels]}


def comment(cid, body, at="2026-10-20T10:00:00Z", user=HOST):
    return {"id": cid, "body": body, "created_at": at, "user": user, "html_url": "https://github.com/x/c/%d" % cid}


class FakeGH:
    def __init__(self, prs=(), issues=(), comments=None):
        self.prs, self.issues, self.comments, self.writes = list(prs), list(issues), comments or {}, []

    def pages(self, path, key=None):
        if "/pulls?state=open" in path: return self.prs
        if "/issues?state=open" in path: return self.issues
        if path.endswith("/comments"): return self.comments.get(int(path.split("/")[-2]), [])
        return []

    def req(self, method, path, data=None, ok404=False, **kw):
        if method != "GET": self.writes.append((method, path)); return {}
        return {"statuses": [], "check_runs": []}


class Classifier(unittest.TestCase):
    def test_draft_acceptance_not_run(self):
        ev = HR.handback_event(pr(562, draft=True, body=ACCEPT_BODY), [])
        self.assertEqual(ev["kind"], "host-acceptance")

    def test_non_draft_or_non_host_body_is_not_a_handback(self):
        self.assertIsNone(HR.handback_event(pr(562, draft=False, body=ACCEPT_BODY), []))
        self.assertIsNone(HR.handback_event(pr(562, draft=True, body=ACCEPT_BODY, user={"login": "someone"}), []))
        self.assertIsNone(HR.handback_event(pr(562, draft=True, body="Gate B: NOT RUN"), []))

    def test_newest_host_comment_decides(self):
        item = pr(566)
        self.assertEqual(HR.handback_event(item, [comment(1, "Host review required.")])["source"], "comment 1")
        newer = [comment(1, "Host review required."), comment(2, "Reviewed: PASS", at="2026-10-20T11:00:00Z")]
        self.assertIsNone(HR.handback_event(item, newer))
        self.assertIsNone(HR.handback_event(item, [comment(3, "no host review required")]))
        self.assertIsNone(HR.handback_event(item, [comment(4, "host review required", user={"login": "x"})]))


class Alarm(unittest.TestCase):
    def setUp(self):
        RINGS.clear()
        self.tmp = tempfile.mkdtemp()
        os.makedirs(self.tmp + "/logs")
        self.patches = [patch.object(A, k, v) for k, v in dict(
            D=self.tmp, ST=self.tmp + "/stall-alarm-state.json", CLAIMS=self.tmp + "/auto-filler/fix-claims",
            VKFILL_HELD_DIR=self.tmp + "/auto-filler/vkfill-held", lane_process_running=lambda n: False,
            auto_fix=self.fail_auto_fix).items()]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        shutil.rmtree(self.tmp)

    def fail_auto_fix(self, key, desc, dry):
        self.auto_fixed = key
        return "auto-fix called"

    def run_alarm(self, gh, dry=False):
        out = io.StringIO()
        with patch.object(A, "GH", lambda: gh), redirect_stdout(out):
            A.main(dry)
        return out.getvalue()

    def age(self, minutes):
        st = json.loads(read(A.ST))
        for k, v in st.items():
            if isinstance(v, dict) and "since" in v: v["since"] -= minutes * 60
        write(A.ST, json.dumps(st))

    def review_rings(self):
        return [r for r in RINGS if r[0][2] == "stuck_stall"]

    def test_overdue_draft_acceptance_routes_one_managing_dr_action(self):
        gh = FakeGH(prs=[pr(562, draft=True, body=ACCEPT_BODY)])
        self.run_alarm(gh)
        self.assertEqual(RINGS, [])
        self.age(21)
        self.run_alarm(gh)
        rings = self.review_rings()
        self.assertEqual(len(rings), 1)
        self.assertEqual(rings[0][1]["meta"]["item_key"], "host-review:562")
        self.assertIn("host-acceptance", rings[0][0][1])
        self.assertFalse(hasattr(self, "auto_fixed"))
        self.assertFalse(os.path.exists(self.tmp + "/auto-filler/requeue"))
        self.assertEqual(gh.writes, [])
        self.age(5)
        self.run_alarm(gh)
        self.assertEqual(len(self.review_rings()), 1)
        self.assertFalse(hasattr(self, "auto_fixed"))

    def test_pending_plan_is_not_running(self):
        os.makedirs(self.tmp + "/auto-filler/requeue")
        write(self.tmp + "/auto-filler/requeue/566", "stall-alarm planned\n")
        write(self.tmp + "/rereview-state.json", json.dumps({"566": {"active": True}}))
        gh = FakeGH(prs=[pr(566)], comments={566: [comment(9, "Handback ready. Host review required.")]})
        self.run_alarm(gh)
        self.age(31)
        self.run_alarm(gh)
        self.assertEqual(len(self.review_rings()), 1)
        self.assertFalse([r for r in RINGS if "NO round running" in r[0][1]])
        self.assertFalse(hasattr(self, "auto_fixed"))

    def test_live_lane_process_owns_it(self):
        gh = FakeGH(prs=[pr(566)], comments={566: [comment(9, "host review required")]})
        with patch.object(A, "lane_process_running", lambda n: True):
            self.run_alarm(gh); self.age(21); self.run_alarm(gh)
        self.assertEqual(self.review_rings(), [])
        self.assertFalse(hasattr(self, "auto_fixed"))
        self.run_alarm(gh)
        self.assertEqual(len(self.review_rings()), 1)

    def test_needs_craig_hold_is_preserved(self):
        gh = FakeGH(prs=[pr(565, draft=True, body=ACCEPT_BODY, labels=["needs-craig"])])
        self.run_alarm(gh); self.age(21); self.run_alarm(gh)
        self.assertEqual(self.review_rings(), [])
        self.assertFalse(hasattr(self, "auto_fixed"))

    def test_under_twenty_minutes_waits(self):
        gh = FakeGH(prs=[pr(562, draft=True, body=ACCEPT_BODY)])
        self.run_alarm(gh); self.age(19); self.run_alarm(gh)
        self.assertEqual(RINGS, [])

    def test_non_handback_keeps_existing_auto_fix(self):
        gh = FakeGH(prs=[pr(600)])
        self.run_alarm(gh); self.age(21); self.run_alarm(gh)
        self.assertEqual(self.auto_fixed, "pr600")
        self.assertEqual(self.review_rings(), [])

    def test_issue_handback_is_not_requeued(self):
        issue = {"number": 567, "labels": [{"name": "project:tsv"}], "updated_at": "2026-10-20T10:00:00Z",
                 "html_url": "https://github.com/x/issues/567", "body": "", "user": HOST}
        gh = FakeGH(issues=[issue], comments={567: [comment(5, "Host review required")]})
        self.run_alarm(gh); self.age(21); self.run_alarm(gh)
        self.assertEqual(len(self.review_rings()), 1)
        self.assertFalse(hasattr(self, "auto_fixed"))

    def test_hourly_action_budget(self):
        gh = FakeGH(prs=[pr(562, draft=True, body=ACCEPT_BODY)])
        self.run_alarm(gh)
        st = json.loads(read(A.ST))
        st["review:562"] = {"at": st["pr562"]["since"] - 10 * 60, "fp": "older"}
        write(A.ST, json.dumps(st))
        self.age(21); self.run_alarm(gh)
        self.assertEqual(self.review_rings(), [])
        st = json.loads(read(A.ST))
        st["review:562"]["at"] -= 3600
        write(A.ST, json.dumps(st))
        self.run_alarm(gh)
        self.assertEqual(len(self.review_rings()), 1)

    def test_ring_failure_retries_without_fallback(self):
        gh = FakeGH(prs=[pr(562, draft=True, body=ACCEPT_BODY)])
        self.run_alarm(gh); self.age(21)
        with patch.object(sys.modules["bell_gate"], "ring", side_effect=OSError("down")):
            self.run_alarm(gh)
        self.assertFalse(hasattr(self, "auto_fixed"))
        self.run_alarm(gh)
        self.assertEqual(len(self.review_rings()), 1)

    def test_dry_run_writes_nothing(self):
        gh = FakeGH(prs=[pr(562, draft=True, body=ACCEPT_BODY)])
        self.run_alarm(gh); self.age(21)
        before = read(A.ST)
        logs_before = {f: read(self.tmp + "/logs/" + f) for f in os.listdir(self.tmp + "/logs")}
        out = self.run_alarm(gh, dry=True)
        self.assertIn("DRY would route to managing dr", out)
        self.assertEqual(RINGS, [])
        self.assertEqual(read(A.ST), before)
        self.assertEqual({f: read(self.tmp + "/logs/" + f) for f in os.listdir(self.tmp + "/logs")}, logs_before)

    def test_dry_run_shows_young_handback(self):
        gh = FakeGH(prs=[pr(562, draft=True, body=ACCEPT_BODY)])
        out = self.run_alarm(gh, dry=True)
        self.assertIn("host handback seen 0 min; at 20 min: DRY would route", out)
        self.assertFalse(os.path.exists(A.ST))


if __name__ == "__main__":
    unittest.main()
