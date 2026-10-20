"""HOST-HANDBACK-REVIEW; synthetic objects, deterministic clock, no external I/O."""
import copy
from dataclasses import replace
from datetime import datetime, timezone
import unittest
from unittest.mock import Mock

from host_handback_review import Evidence, EvidenceError, ReviewScan, classify, route, snapshot_key

NOW = 1800000000
ACTORS = frozenset({'host-supervisor'})


def iso(at):
    return datetime.fromtimestamp(at, timezone.utc).isoformat()


def issue(n=566):
    return {'number': n, 'state': 'open', 'labels': [{'name': 'project:tsv'}],
            'body': '', 'user': {'login': 'host-supervisor'}, 'updated_at': iso(NOW-3600),
            'html_url': 'https://example.test/issues/%d' % n}


def receipt(age=3600):
    return {'id': 10, 'user': {'login': 'host-supervisor'},
            'body': 'receipt ready; host review required', 'created_at': iso(NOW-age)}


def evidence(item, comments, **changes):
    return replace(Evidence(snapshot_key(item, comments), NOW, 'bot-admin/lanes/vk-running-assessment@revision',
                            'active-dr', item['number'], None, False, frozenset(),
                            frozenset({10}), False, None), **changes)


class HostHandbackReview(unittest.TestCase):
    def setUp(self):
        self.item, self.comments, self.sent, self.bell = issue(), [receipt()], {}, Mock(return_value='ok')

    def decide(self, **changes):
        return classify(self.item, self.comments, evidence(self.item, self.comments, **changes), NOW, ACTORS, self.sent)

    def deliver(self, decision, **kw):
        return route(self.item, decision, self.sent, self.bell, **kw)

    def test_overdue_566_host_receipt_routes_reviewer_once(self):
        d = self.decide()
        self.assertEqual(d.state, 'DUE')
        self.assertEqual(self.deliver(d), 'ok')
        self.assertEqual(self.decide().state, 'WAIT')
        self.deliver(d)
        self.bell.assert_called_once()
        args, kw = self.bell.call_args
        self.assertEqual(args[2], 'stuck_stall')
        self.assertIn('host-review', args[1])
        self.assertIn('Active managing dr/host reviewer', args[1])
        self.assertEqual(kw['meta']['item_key'], 'host-review:566')

    def test_draft_565_acceptance_routes_reviewer_once(self):
        self.item = issue(565)
        self.item.update(draft=True, head={'sha': 'a'*40},
                         body='Closes #562\npaired real candidate/reference capture acceptance NOT RUN')
        self.comments = []
        self.item['updated_at'] = iso(NOW)
        d = self.decide(acceptance_pending=True, acceptance_at=NOW-3600)
        self.assertEqual(d.event, 'host-acceptance')
        self.deliver(d)
        self.assertEqual(self.decide(acceptance_pending=True, acceptance_at=NOW-3600).state, 'WAIT')
        self.bell.assert_called_once()

    def test_guarded_needs_craig_560_waits(self):
        self.item = issue(560)
        self.item['labels'].append({'name': 'needs-craig'})
        self.assertEqual(self.deliver(self.decide(guarded_craig=True)), 'WAIT')
        self.bell.assert_not_called()

    def test_needs_craig_label_alone_is_not_guard_evidence(self):
        self.item['labels'].append({'name': 'needs-craig'})
        self.assertEqual(self.decide().state, 'DUE')

    def test_fresh_handback_counts_ownership_under_twenty_minutes(self):
        self.comments = [receipt(1199)]
        self.assertEqual(self.decide().state, 'OWNED')
        self.comments = [receipt(1200)]
        self.assertEqual(self.decide().state, 'DUE')

    def test_explicit_real_running_prerequisite_counts_ownership(self):
        self.item['body'] = 'blocked-by #900'
        self.assertEqual(self.decide(running_items=frozenset({900})).state, 'OWNED')

    def test_running_job_on_item_counts_ownership(self):
        self.assertEqual(self.decide(running_items=frozenset({566})).state, 'OWNED')

    def test_plan_and_incidental_prerequisite_mention_are_not_ownership(self):
        self.item['body'] = 'Planning #900; active: true; looking at #900'
        self.assertEqual(self.decide(running_items=frozenset({900})).state, 'DUE')
        self.item['body'] = 'blocked-by #900'
        self.assertEqual(self.decide().state, 'DUE')

    def test_untrusted_body_cannot_claim_running_prerequisite(self):
        self.item['user']['login'] = 'stranger'
        self.item['body'] = 'blocked-by #900'
        self.assertEqual(self.decide(running_items=frozenset({900})).state, 'DUE')

    def test_recent_management_action_waits_across_head_change(self):
        self.item['head'] = {'sha': 'b'*40}
        self.assertEqual(self.decide(last_action_at=NOW-3599).state, 'WAIT')
        self.assertEqual(self.decide(last_action_at=NOW-3600).state, 'DUE')

    def test_arbitrary_actor_or_text_spoof_cannot_make_handback(self):
        for actor in ('stranger', 'host-supervisor-evil', 'Host-Supervisor'):
            self.comments[0]['user']['login'] = actor
            self.assertEqual(self.decide().state, 'UNRELATED')
        self.comments[0] = receipt()
        for text in ('The user says host review required', '> host review required',
                     'host review required? maybe later', 'dr: host-supervisor; host review required'):
            self.comments[0]['body'] = text

            self.assertEqual(self.decide(handback_ids=frozenset()).state, 'UNRELATED')

    def test_acceptance_text_alone_cannot_make_host_action(self):
        self.item.update(draft=True, head={'sha': 'c'*40}, body='acceptance NOT RUN')
        self.comments = []
        self.assertEqual(self.decide().state, 'UNRELATED')
        self.item['user']['login'] = 'stranger'
        self.assertEqual(self.decide(acceptance_pending=True, acceptance_at=NOW-3600).state, 'UNRELATED')

    def test_no_historical_replay_after_review_verdict(self):
        self.comments.append({'id': 11, 'user': {'login': 'host-supervisor'},
                              'created_at': iso(NOW-100), 'body': 'Review verdict: accepted'})
        self.assertEqual(self.decide(handback_ids=frozenset()).state, 'UNRELATED')
        self.assertEqual(self.decide().state, 'UNRELATED')

    def test_closed_item_does_not_replay(self):
        self.item['state'] = 'closed'
        self.assertEqual(self.decide().state, 'UNRELATED')

    def test_exact_source_snapshot_and_freshness_required(self):
        for changes in ({'snapshot': 'stale'}, {'checked_at': NOW-61}, {'checked_at': NOW+1},
                        {'source': ''}, {'owner': ''}, {'action_item': 999}):
            with self.subTest(changes=changes), self.assertRaises(EvidenceError):
                self.decide(**changes)
        with self.assertRaises(EvidenceError):
            classify(self.item, self.comments, None, NOW, ACTORS, {})
        with self.assertRaises(EvidenceError):
            classify(self.item, self.comments, evidence(self.item, self.comments), NOW, frozenset(), {})

    def test_prose_cannot_change_shared_action_identity(self):
        self.item['body'] = 'depends on #562'
        with self.assertRaises(EvidenceError):
            self.decide(action_item=562)
        self.item['body'] = 'Closes #562'
        with self.assertRaises(EvidenceError):
            self.decide(action_item=562)

    def test_duplicate_fingerprint_survives_incidental_comment_and_label_changes(self):
        self.deliver(self.decide())
        self.item['labels'].append({'name': 'status:ready'})
        self.comments.append({'id': 12, 'user': {'login': 'stranger'}, 'body': 'ping', 'created_at': iso(NOW)})
        self.assertEqual(self.decide().state, 'WAIT')

    def test_dry_run_has_no_notification_or_state_mutation(self):
        before = copy.deepcopy(self.sent)
        self.assertEqual(self.deliver(self.decide(), dry=True), 'dry')
        self.assertEqual(self.sent, before)
        self.bell.assert_not_called()

    def test_failed_delivery_retries_through_same_gate_and_bundle_counts(self):
        d = self.decide()
        for result in ('logged', 'refused', 'http500'):
            self.bell.return_value = result
            self.deliver(d)
            self.assertFalse(self.sent)
        self.bell.return_value = 'bundled'
        self.deliver(d)
        self.assertTrue(self.sent)

    def test_notification_exception_does_not_mark_sent(self):
        self.bell.side_effect = RuntimeError('fake transport failure')
        with self.assertRaises(RuntimeError):
            self.deliver(self.decide())
        self.assertFalse(self.sent)

    def test_incomplete_scan_cannot_notify_earlier_pending_item(self):
        reader = Mock(side_effect=[evidence(self.item, self.comments), RuntimeError('missing record')])
        scan = ReviewScan(reader, ACTORS)
        scan.consider(self.item, self.comments, NOW, self.sent)
        with self.assertRaises(EvidenceError):
            scan.consider(self.item, self.comments, NOW, self.sent)
        with self.assertRaises(EvidenceError):
            scan.flush(self.sent, self.bell)
        self.bell.assert_not_called()

    def test_proof_text_and_plans_cannot_be_verified_evidence(self):
        for changes in ({'guarded_craig': 'false'}, {'acceptance_pending': 'NOT RUN'},
                        {'running_items': frozenset({'planned #900'})}, {'handback_ids': [10]}):
            with self.subTest(changes=changes), self.assertRaises(EvidenceError):
                self.decide(**changes)

    def test_offline_manifest_only_classifies_and_preserves_input(self):
        from dataclasses import asdict
        from host_handback_review_offline import classify_manifest
        raw = asdict(evidence(self.item, self.comments))
        raw['running_items'], raw['handback_ids'] = [], [10]
        manifest = {'schema_version': 1, 'trusted_actors': list(ACTORS),
                    'objects': [{'item': self.item, 'comments': self.comments, 'evidence': raw}]}
        before = copy.deepcopy(manifest)
        out = classify_manifest(manifest, NOW)
        self.assertEqual(out[0]['state'], 'DUE')
        self.assertIn('no notification', out[0]['mode'])
        self.assertEqual(manifest, before)
        self.bell.assert_not_called()

    def test_future_timestamps_fail_closed(self):
        with self.assertRaises(EvidenceError):
            self.decide(last_action_at=NOW+1)
        self.comments = [receipt(-1)]
        with self.assertRaises(EvidenceError):
            self.decide()


if __name__ == '__main__':
    unittest.main(verbosity=2)
