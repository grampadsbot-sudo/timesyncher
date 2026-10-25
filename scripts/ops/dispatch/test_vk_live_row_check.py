#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
import datetime as dt
import io
import json
import tempfile
import types
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'dispatch'))
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'gateb'))

import rowfix_brief  # noqa: E402
import vk_live_row_check  # noqa: E402
from ui_paths import pr_touches_app_ui  # noqa: E402
import host_handback_review as HR
import pr_issue_links
import tsv_stall_alarm as alarm

PR569_PATHS = (
    'scripts/ops/dispatch/host_handback_entrypoint.py',
    'scripts/ops/dispatch/tsv_stall_alarm.py',
    'scripts/ops/dispatch/test_host_handback_alarm.py',
)

ISSUE567_BODY = (
    'Source scripts/ops/dispatch; no UI/checker/fixtures/deploy/CI/dependency/secret changes.'
)


class VkLiveRowCheckTests(unittest.TestCase):
    def test_pr569_paths_are_ops_only(self) -> None:
        self.assertEqual(pr_touches_app_ui(PR569_PATHS), [])
        verdict = vk_live_row_check.host_row_check_verdict(PR569_PATHS)
        self.assertEqual(verdict['verdict'], vk_live_row_check.ROW_CHECK_NA)

    def test_app_pr_runs_row_check(self) -> None:
        paths = (*PR569_PATHS, 'apps/vacation-client/src/components/ListRow.tsx')
        self.assertTrue(pr_touches_app_ui(paths))
        verdict = vk_live_row_check.host_row_check_verdict(
            paths,
            head_row_failures=['Apple Fifth Avenue: missing visible name line (fail closed)'],
            base_known_row_failures=['Apple Fifth Avenue: missing visible name line (fail closed)'],
        )
        self.assertEqual(verdict['verdict'], vk_live_row_check.ROW_CHECK_PASS)

    def test_new_row_failure_fails_app_pr(self) -> None:
        paths = ('apps/vacation-client/src/styles.css',)
        verdict = vk_live_row_check.host_row_check_verdict(
            paths,
            head_row_failures=['Blue Note: missing visible name line (fail closed)'],
            base_known_row_failures=[],
        )
        self.assertEqual(verdict['verdict'], vk_live_row_check.ROW_CHECK_FAIL)
        self.assertEqual(len(verdict['actionable_failures']), 1)

    def test_rowfix_brief_strips_app_edits_on_ops_pr(self) -> None:
        brief = '\n'.join([
            'Fix row logos on events tab.',
            'Edit apps/vacation-client/src/components/ListRow.tsx and wrap names in <strong>.',
            'Touch src/vacation/trek-live-product-patches.mjs for translateY(-2px).',
        ])
        out = rowfix_brief.filter_rowfix_brief(brief, PR569_PATHS, ISSUE567_BODY)
        self.assertIn('N/A', out)
        self.assertNotIn('ListRow.tsx', out)
        self.assertNotIn('translateY', out)

    def test_rowfix_brief_keeps_app_guidance_on_app_pr(self) -> None:
        brief = 'Adjust apps/vacation-client/src/styles.css for row layout.'
        paths = ('apps/vacation-client/src/styles.css',)
        out = rowfix_brief.filter_rowfix_brief(brief, paths, 'Fix list row layout on migrate/trek-source.')
        self.assertEqual(out, brief)

    def test_lane_autofill_row_check_record_alias(self) -> None:
        rec = vk_live_row_check.lane_autofill_row_check_record(PR569_PATHS)
        self.assertEqual(rec['verdict'], vk_live_row_check.ROW_CHECK_NA)


class HostHandbackAlarmTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'logs').mkdir()
        self.now = dt.datetime(2026, 10, 25, 17, tzinfo=dt.timezone.utc).timestamp()
        self.ring = Mock(return_value='ok')
        self.gh = Mock()
        self.prs, self.issues, self.comments = [], [], {}
        self.gh.pages.side_effect = self.pages
        self.gh.req.return_value = {'statuses': [], 'check_runs': []}
        self.auto_fix = Mock(return_value='existing generic fix')
        patches = [
            patch.object(alarm, 'D', str(self.root)),
            patch.object(alarm, 'ST', str(self.root / 'alarm.json')),
            patch.object(alarm, 'GH', return_value=self.gh),
            patch.object(alarm, 'auto_fix', self.auto_fix),
            patch.object(alarm, 'lane_process_running', return_value=False),
            patch.object(alarm, 'round_running', return_value=True),
            patch.object(alarm, 'vkfill_held_stall_checks', return_value=[]),
            patch.object(alarm, 'check_fix_claims', return_value=[]),
            patch.object(alarm, 'launches_not_started', return_value=[]),
            patch.object(alarm.time, 'time', side_effect=lambda: self.now),
            patch.dict(sys.modules, {'bell_gate': types.SimpleNamespace(ring=self.ring)}),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def stamp(self, age):
        return dt.datetime.fromtimestamp(self.now - age, dt.timezone.utc).isoformat()

    def pr(self, n=565, age=1200, labels=(), body='Host acceptance: NOT RUN'):
        return dict(number=n, state='open', draft=True, body=body, title='host result',
                    user={'login': 'grampadsbot-sudo'}, html_url='https://github.com/x/pull/%d' % n,
                    head={'sha': '%040x' % n}, base={'ref': 'migrate/trek-source'},
                    labels=[{'name': x} for x in labels], updated_at=self.stamp(age))

    def comment(self, cid=1, age=1200, body='Receipt ready; host review required'):
        return dict(id=cid, created_at=self.stamp(age), body=body,
                    user={'login': 'grampadsbot-sudo'}, html_url='https://github.com/x/comment/%d' % cid)

    def pages(self, path):
        if '/pulls?state=open' in path:
            return self.prs
        if '/issues?state=open' in path:
            return self.issues
        if path.endswith('/comments'):
            return self.comments.get(int(path.split('/')[-2]), [])
        return []

    def run_alarm(self, dry=False):
        out = io.StringIO()
        with redirect_stdout(out):
            alarm.main(dry)
        return out.getvalue()

    def test_overdue_on_first_scan_routes_once_without_generic_retry(self):
        self.prs = [self.pr()]
        self.run_alarm()
        self.now += 3 * 3600
        self.run_alarm()
        self.ring.assert_called_once()
        self.assertEqual(self.ring.call_args.args[2], 'stuck_stall')
        self.assertEqual(self.ring.call_args.kwargs['meta']['item_key'], 'host-review:565')
        self.auto_fix.assert_not_called()
        self.gh.req.assert_called()
        self.assertTrue(all(c.args[0] == 'GET' for c in self.gh.req.call_args_list))
        self.assertFalse((self.root / 'auto-filler' / 'requeue').exists())

    def test_exact_twenty_minute_boundary_uses_event_clock(self):
        self.prs = [self.pr(age=1199)]
        self.run_alarm()
        self.ring.assert_not_called()
        self.now += 1
        self.run_alarm()
        self.ring.assert_called_once()

    def test_issue_handback_bypasses_pending_plan_and_active_flag(self):
        issue = self.pr(n=566, body='Read-only lineage prep; no PR by design')
        issue.pop('draft')
        self.issues = [issue]
        self.comments[566] = [self.comment()]
        (self.root / 'rereview-state.json').write_text(json.dumps({'566': {'active': True}}))
        self.run_alarm()
        self.ring.assert_called_once()
        self.auto_fix.assert_not_called()

    def test_real_process_delays_review_until_it_exits(self):
        self.prs = [self.pr()]
        with patch.object(alarm, 'lane_process_running', return_value=True):
            self.run_alarm()
        self.ring.assert_not_called()
        self.run_alarm()
        self.ring.assert_called_once()

    def test_holds_never_route_or_requeue(self):
        for label in ['needs-craig', 'hold', 'hold:after-566', 'parked:later', 'do-not-merge']:
            with self.subTest(label=label):
                self.prs = [self.pr(labels=[label])]
                self.run_alarm()
        self.ring.assert_not_called()
        self.auto_fix.assert_not_called()
        self.assertTrue(all(c.args[0] == 'GET' for c in self.gh.req.call_args_list))

    def test_changed_head_obeys_hourly_action_budget(self):
        self.prs = [self.pr(age=7200)]
        self.run_alarm()
        self.prs[0]['head']['sha'] = 'a' * 40
        self.now += 3599
        self.run_alarm()
        self.assertEqual(self.ring.call_count, 1)
        self.now += 1
        self.run_alarm()
        self.assertEqual(self.ring.call_count, 2)
        self.auto_fix.assert_not_called()

    def test_relay_failure_never_falls_back_to_coder_or_gate_b(self):
        self.prs = [self.pr()]
        for result in [OSError('relay down'), 'rc1', 'logged']:
            with self.subTest(result=result):
                self.ring.side_effect = result if isinstance(result, Exception) else None
                self.ring.return_value = result
                self.run_alarm()
        self.auto_fix.assert_not_called()
        self.ring.side_effect = None
        self.ring.return_value = 'ok'
        self.run_alarm()
        self.assertEqual(self.ring.call_count, 4)

    def test_dry_run_writes_no_state_or_logs_and_sends_nothing(self):
        self.prs = [self.pr()]
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertIn('DRY would route to managing dr', self.run_alarm(dry=True))
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()})
        self.ring.assert_not_called()
        self.auto_fix.assert_not_called()
        self.assertTrue(all(c.args[0] == 'GET' for c in self.gh.req.call_args_list))

    def test_resolved_or_closed_history_is_not_replayed(self):
        item = self.pr()
        self.assertIsNone(HR.handback_event(dict(item, state='closed'), [self.comment()]))
        comments = [self.comment(age=3600), self.comment(cid=2, age=600, body='Reviewed: PASS')]
        self.assertIsNone(HR.handback_event(item, comments))
        self.assertIsNone(HR.handback_event(dict(item, draft=False), comments[:1] +
                                          [self.comment(cid=3, age=500, body='No host review required')]))

    def test_untrusted_missing_or_future_event_never_becomes_retry(self):
        self.assertIsNone(HR.handback_event(dict(self.pr(), user={'login': 'other'}), []))
        for age in [None, -60]:
            self.prs = [self.pr(age=0)]
            self.prs[0]['updated_at'] = None if age is None else self.stamp(age)
            self.run_alarm()
        self.ring.assert_not_called()
        self.auto_fix.assert_not_called()

    def test_linked_refs_pr_owns_issue_without_duplicate_review(self):
        self.prs = [self.pr(body='Refs #566\nHost acceptance: NOT RUN')]
        self.issues = [dict(self.pr(n=566), draft=False)]
        self.comments[566] = [self.comment()]
        self.assertEqual(pr_issue_links.issue_pr_map(self.prs), {566: 565})
        self.run_alarm()
        self.ring.assert_called_once()
        self.auto_fix.assert_not_called()

    def test_ordinary_pr_keeps_existing_stall_action(self):
        self.prs = [self.pr(body='ordinary source change')]
        self.run_alarm()
        self.now += 1200
        self.run_alarm()
        self.auto_fix.assert_called_once()


if __name__ == '__main__':
    unittest.main()
