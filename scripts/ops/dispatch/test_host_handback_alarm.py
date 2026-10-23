"""Offline integration regressions against the applied tracked alarm hook."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

SOURCE = Path(__file__).resolve().parent
ALARM_SOURCE = SOURCE / "tsv_stall_alarm.py"
sys.path.insert(0, str(SOURCE))
from host_handback_review import EvidenceError, ReviewScan
from test_host_handback_review import ACTORS, NOW, evidence, issue, receipt


class AlarmIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.item, self.comments = issue(), [receipt()]
        self.prs, self.issues = [], [self.item]
        self.changes = {}
        self.bell = Mock(return_value='ok')
        self.clear = Mock(side_effect=AssertionError('must not clear ready'))
        self.gh = types.SimpleNamespace(pages=self.pages, req=Mock(side_effect=AssertionError('no generic GH writes/checks')))
        common = types.ModuleType('tsv_common')
        common.GH, common.REPO, common.D = lambda: self.gh, 'synthetic/repo', str(self.root)
        links = types.ModuleType('pr_issue_links')
        links.issue_pr_map, links.clear_issue_ready = lambda prs: {}, self.clear
        bell = types.ModuleType('bell_gate')
        bell.ring = self.bell
        self.modules = patch.dict(sys.modules, tsv_common=common, pr_issue_links=links, bell_gate=bell)
        self.modules.start()
        spec = importlib.util.spec_from_file_location('alarm_under_test', ALARM_SOURCE)
        self.alarm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.alarm)
        self.alarm.log = Mock()
        self.alarm.auto_fix = Mock(side_effect=AssertionError('wrong generic fix'))
        self.alarm.check_fix_claims = lambda *a: []
        self.alarm.launches_not_started = lambda *a: []
        self.alarm.round_running = Mock(side_effect=AssertionError('no managed lane query'))
        self.state = self.root / 'stall-alarm-state.json'
        self.state.write_text(json.dumps({'is566': {'since': NOW-7200, 'h': 'old'},
                                         'pr565': {'since': NOW-7200, 'h': 'old'}}))

    def tearDown(self):
        self.modules.stop()
        self.temp.cleanup()

    def pages(self, path):
        if '/comments' in path:
            return self.comments
        if '/pulls?' in path:
            return self.prs
        if '/issues?' in path:
            return self.issues
        raise AssertionError(path)

    def run_alarm(self, dry=False):
        context = ReviewScan(lambda i, c, t: evidence(i, c, **self.changes), ACTORS)
        with patch.object(self.alarm.time, 'time', return_value=NOW):
            self.alarm.main(dry=dry, review_scan=context)
        self.alarm.auto_fix.assert_not_called()
        self.gh.req.assert_not_called()
        self.clear.assert_not_called()

    def test_overdue_issue_routes_reviewer_not_free_lane_once(self):
        self.run_alarm()
        self.run_alarm()
        self.bell.assert_called_once()
        self.assertEqual(self.bell.call_args.args[2], 'stuck_stall')
        self.assertTrue(json.loads(self.state.read_text())['host-review-sent'])

    def test_draft_acceptance_routes_reviewer_not_forced_gateb_once(self):
        self.item = issue(565)
        self.item.update(draft=True, head={'sha': 'a'*40}, base={'ref': 'migrate/trek-source'},
                         body='Closes #562\npaired real candidate/reference capture acceptance NOT RUN')
        self.prs, self.issues, self.comments = [self.item], [], []
        self.changes = {'acceptance_pending': True, 'acceptance_at': NOW-3600}
        self.run_alarm()
        self.run_alarm()
        self.bell.assert_called_once()
        self.assertIn('host-acceptance', self.bell.call_args.args[1])

    def test_fresh_handback_never_requeues(self):
        self.comments = [receipt(1199)]
        self.run_alarm()
        self.bell.assert_not_called()

    def test_guarded_craig_wait_never_requeues(self):
        self.item = issue(560)
        self.item.update(draft=False, head={'sha': 'b'*40}, base={'ref': 'migrate/trek-source'})
        self.item['labels'].append({'name': 'needs-craig'})
        self.prs, self.issues = [self.item], []
        self.changes = {'guarded_craig': True}
        self.run_alarm()
        self.bell.assert_not_called()

    def test_real_prerequisite_ownership_never_requeues(self):
        self.item['body'] = 'blocked-by #900'
        self.changes = {'running_items': frozenset({900})}
        self.run_alarm()
        self.bell.assert_not_called()

    def test_recent_shared_action_never_requeues(self):
        self.changes = {'last_action_at': NOW-600}
        self.run_alarm()
        self.bell.assert_not_called()

    def test_read_error_stops_before_generic_fix_notification_or_state_write(self):
        before = self.state.read_bytes()
        context = ReviewScan(Mock(side_effect=RuntimeError('missing canonical reader')), ACTORS)
        with self.assertRaises(EvidenceError):
            self.alarm.main(review_scan=context)
        self.alarm.auto_fix.assert_not_called()
        self.bell.assert_not_called()
        self.assertEqual(self.state.read_bytes(), before)

    def test_missing_adapter_stops_before_gh(self):
        with self.assertRaises(EvidenceError):
            self.alarm.main(dry=True)
        self.gh.req.assert_not_called()
        self.bell.assert_not_called()

    def test_dry_run_does_not_notify_or_write_state(self):
        before = self.state.read_bytes()
        self.run_alarm(dry=True)
        self.bell.assert_not_called()
        self.assertEqual(self.state.read_bytes(), before)

    def test_dry_run_skips_all_legacy_ancillary_checks(self):
        self.alarm.check_fix_claims = Mock(side_effect=AssertionError("dry claim mutation"))
        self.alarm.launches_not_started = Mock(side_effect=AssertionError("dry launch write"))
        self.alarm.log = Mock(side_effect=AssertionError("dry log write"))
        self.run_alarm(dry=True)
        self.bell.assert_not_called()

    def test_corrupt_review_state_cannot_reset_dedupe(self):
        self.state.write_text('{bad json')
        with self.assertRaisesRegex(EvidenceError, 'alarm state unreadable'):
            self.run_alarm()
        self.bell.assert_not_called()

    def test_named_proof_fails_if_alarm_hook_omitted(self):
        import host_handback_live_dryrun as proof
        fake_source = self.root / 'isolated-proof'
        fake_source.mkdir()
        (fake_source / 'tsv_stall_alarm.py').write_text('def main(dry=False):\n    return {}\n')
        args = types.SimpleNamespace(runtime_root=str(self.root))
        context = ReviewScan(lambda i, c, t: evidence(i, c), ACTORS)
        original_path = list(sys.path)
        try:
            with patch.object(proof, '__file__', str(fake_source / 'proof.py')), \
                 patch.object(proof.argparse.ArgumentParser, 'parse_args', return_value=args), \
                 patch('host_handback_evidence.CanonicalCollector', return_value=types.SimpleNamespace(scan=lambda: context)):
                with self.assertRaises(TypeError):
                    proof.main()
        finally:
            sys.path[:] = original_path
        self.bell.assert_not_called()
        self.gh.req.assert_not_called()

    def test_closed_current_object_never_enters_generic_fix(self):
        self.item["state"] = "closed"
        self.run_alarm()
        self.bell.assert_not_called()

    def test_late_preflight_error_cancels_earlier_due_event(self):
        second = issue(567)
        self.issues.append(second)
        before = self.state.read_bytes()
        reader = Mock(side_effect=[evidence(self.item, self.comments), EvidenceError("second record unreadable")])
        with self.assertRaises(EvidenceError):
            self.alarm.main(review_scan=ReviewScan(reader, ACTORS))
        self.alarm.auto_fix.assert_not_called()
        self.bell.assert_not_called()
        self.assertEqual(self.state.read_bytes(), before)

    def test_github_scan_failure_cannot_fall_back_to_generic_ring(self):
        self.gh.pages = Mock(side_effect=OSError("synthetic read failure"))
        before = self.state.read_bytes()
        with self.assertRaises(EvidenceError):
            self.run_alarm()
        self.bell.assert_not_called()
        self.assertEqual(self.state.read_bytes(), before)

    def test_scoped_launch_alarm_cannot_ring_generic_for_handback(self):
        self.alarm.launches_not_started = lambda *a: [("launch:codex-ubuntu:vkfill-566:stamp", "old launch")]
        self.run_alarm()
        self.bell.assert_called_once()
        self.assertEqual(self.bell.call_args.args[2], "stuck_stall")

    def test_handled_item_excluded_from_fix_claim_remediation(self):
        claims = Mock(return_value=[])
        self.alarm.check_fix_claims = claims
        self.run_alarm()
        self.assertIn(566, claims.call_args.args[2])

    def test_existing_hold_guard_preserved(self):
        self.item['labels'].append({'name': 'hold:review'})
        self.run_alarm()
        self.bell.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
