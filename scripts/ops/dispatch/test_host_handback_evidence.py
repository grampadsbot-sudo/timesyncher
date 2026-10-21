"""Offline boundary tests: synthetic canonical records, injected host I/O, no live reads."""
import copy
import hashlib
import json
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import Mock, patch

from host_handback_evidence import (ASSESSMENT, CanonicalCollector, EvidenceError,
                                    HostReaders, authenticate_guarded_look_send,
                                    current_section, last_action, ownership)
from host_handback_events import produce_event
from host_handback_review import classify
from test_host_handback_review import NOW, iso, issue, receipt

SLUG = 'bot-admin/receipts/synthetic-host-review'
SHA = 'a' * 40


def assessment(at=NOW, action=NOW-7200):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    stamp = datetime.fromtimestamp(action, ZoneInfo('America/Los_Angeles')).strftime('%Y-%m-%d %H:%M PT')
    return ('## Current pass follow-through — ' + iso(at).replace('T', ' ').split('+')[0] + ' UTC\n'
            'Source [[' + SLUG + ']].\nOwner active-dr, next review later.\n'
            '| job | evidence | next action |\n| #566 | current host handback | review |\n'
            '\n## Action record\n- ' + stamp + ' | active-dr | #566 exact management action\n')


def manager_assessment(at=NOW):
    """Synthetic values in the published Current manager pass/table format."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    stamp = datetime.fromtimestamp(at, ZoneInfo('America/Los_Angeles')).strftime('%Y-%m-%d %H:%M PT')
    return ('## Current manager pass — ' + stamp + ' (synthetic reviewer)\n'
            'This section supersedes earlier current-state tables; historical records remain below.\n'
            '\n| job | owner | last action/evidence PT | next action/deadline PT |\n'
            '|---|---|---|---|\n'
            '| #801/#802 | synthetic reviewer | source review | next action: inspect receipt |\n'
            '| #803 | other reviewer | evidence mentions #801 | next action: inspect source |\n')


class CanonicalAssessmentSchema(unittest.TestCase):
    def test_current_manager_heading_and_grouped_row_owners(self):
        section = current_section(manager_assessment(), NOW)
        self.assertEqual(ownership(section, 801), 'synthetic reviewer')
        self.assertEqual(ownership(section, 802), 'synthetic reviewer')
        self.assertEqual(ownership(section, 803), 'other reviewer')

    def test_owner_column_overrides_unrelated_owner_prose(self):
        section = manager_assessment() + '\nOwner historical reviewer, next review later.\n'
        self.assertEqual(ownership(section, 801), 'synthetic reviewer')

    def test_current_manager_precedes_legacy_section(self):
        text = manager_assessment() + '\n' + assessment(NOW-3600)
        self.assertTrue(current_section(text, NOW).startswith('## Current manager pass'))

    def test_stale_manager_section_cannot_fall_back_to_fresh_legacy(self):
        with self.assertRaisesRegex(EvidenceError, 'stale'):
            current_section(manager_assessment(NOW-1000) + '\n' + assessment(), NOW)

    def test_future_manager_section_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'future'):
            current_section(manager_assessment(NOW+120), NOW)

    def test_undated_manager_section_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'event time'):
            current_section('## Current manager pass\n' + manager_assessment().split('\n', 1)[1], NOW)

    def test_missing_current_section_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'not found'):
            current_section('## Historical manager pass\n' + manager_assessment().split('\n', 1)[1], NOW)

    def test_duplicate_item_rows_refuse_even_with_same_owner(self):
        text = manager_assessment() + '| #801 | synthetic reviewer | duplicate | later |\n'
        with self.assertRaisesRegex(EvidenceError, 'exact current assessment item row'):
            ownership(text, 801)

    def test_missing_row_and_partial_number_do_not_borrow_owner(self):
        for number in (80, 804):
            with self.assertRaisesRegex(EvidenceError, 'exact current assessment item row'):
                ownership(manager_assessment(), number)

    def test_missing_owner_does_not_fall_back_to_global_prose(self):
        for owner in ('', 'unknown', '—', '?'):
            text = manager_assessment().replace('| synthetic reviewer |', '| ' + owner + ' |')
            with self.assertRaisesRegex(EvidenceError, 'explicit current canonical row owner'):
                ownership(text + '\nOwner fallback reviewer, later.\n', 801)

    def test_duplicate_owner_column_refuses(self):
        text = manager_assessment().replace('| last action/evidence PT |', '| owner |')
        with self.assertRaisesRegex(EvidenceError, 'unambiguous current canonical owner column'):
            ownership(text, 801)

    def test_malformed_owner_row_refuses(self):
        text = manager_assessment().replace('| source review |', '| source | extra |')
        with self.assertRaisesRegex(EvidenceError, 'unambiguous current canonical owner column'):
            ownership(text, 801)

    def test_legacy_unique_owner_remains_supported(self):
        self.assertEqual(ownership(assessment(), 566), 'active-dr')
        with self.assertRaisesRegex(EvidenceError, 'unambiguous current canonical owner'):
            ownership(assessment() + '\nOwner different-dr, later.\n', 566)


class CollectorBoundaries(unittest.TestCase):
    def setUp(self):
        self.item = issue()
        self.item['head'] = {'sha': SHA}
        self.comments = [receipt()]
        self.comments[0].update(html_url='https://example.test/issues/566#issuecomment-10',
                                updated_at=self.comments[0]['created_at'])
        self.comments[0]['user']['id'] = 7
        self.page = assessment()
        self.record = self.comments[0]['html_url'] + '\n' + SHA
        self.readers = Mock(spec=HostReaders)
        self.readers.handback_event_path.return_value = None
        self.readers.handback_event_configured.return_value = False
        self.readers.page.side_effect = lambda slug: self.page if slug == ASSESSMENT else self.record
        self.readers.running.return_value = frozenset()
        self.readers.receipt.return_value = self.comments[0]['body']
        self.gh = Mock()
        self.gh.req.return_value = {'id': 7, 'login': 'host-supervisor'}
        self.collector = CanonicalCollector(self.gh, 'synthetic/repo', self.readers, clock=lambda: NOW)

    def evidence(self):
        return self.collector(self.item, self.comments, NOW)

    def test_authenticated_current_receipt_routes_to_review(self):
        ev = self.evidence()
        self.assertEqual(classify(self.item, self.comments, ev, NOW, self.collector.actors, {}).state, 'DUE')
        self.readers.receipt.assert_called_once_with(self.record, 566, SHA)
        self.assertIn('@sha256:', ev.source)

    def test_unreferenced_host_comment_is_error_not_unrelated(self):
        self.record = SHA
        self.collector.pages[SLUG] = self.record
        with self.assertRaisesRegex(EvidenceError, 'canonical host receipt reference'):
            self.evidence()

    def test_authenticated_actor_requires_both_id_and_login(self):
        for user in ({'id': 8, 'login': 'host-supervisor'}, {'id': 7, 'login': 'stranger'}):
            self.comments[0]['user'] = user
            with self.assertRaisesRegex(EvidenceError, 'actor mismatch'):
                self.evidence()

    def test_edited_host_comment_cannot_reuse_original_event(self):
        self.comments[0]['updated_at'] = iso(NOW)
        with self.assertRaisesRegex(EvidenceError, 'edited host event'):
            self.evidence()

    def test_receipt_bytes_must_equal_authored_event(self):
        self.readers.receipt.return_value = 'host review required'
        with self.assertRaisesRegex(EvidenceError, 'differs'):
            self.evidence()

    def test_missing_receipt_is_never_absence(self):
        self.readers.receipt.side_effect = FileNotFoundError('synthetic missing receipt')
        with self.assertRaises(EvidenceError):
            self.evidence()

    def test_newer_comment_requires_real_resolution_proof(self):
        self.comments.append(dict(id=11, user={'login': 'host-supervisor', 'id': 7},
                                  created_at=iso(NOW-1), body='plan: look later'))
        with self.assertRaisesRegex(EvidenceError, 'resolution proof'):
            self.evidence()

    def test_pending_acceptance_prose_refuses_unsupported_record(self):
        self.item.update(draft=True, body='acceptance NOT RUN')
        with self.assertRaisesRegex(EvidenceError, 'acceptance event reader/schema'):
            self.evidence()

    def test_guarded_craig_requires_actual_reader(self):
        self.item['labels'].append({'name': 'needs-craig'})
        self.readers.guarded_craig.side_effect = EvidenceError('missing authenticated guard')
        with self.assertRaises(EvidenceError):
            self.evidence()

    def test_guard_prose_is_not_boolean_proof(self):
        self.item['labels'].append({'name': 'needs-craig'})
        self.readers.guarded_craig.return_value = 'guarded Craig'
        with self.assertRaisesRegex(EvidenceError, 'boolean proof'):
            self.evidence()

    def test_head_change_does_not_reset_shared_hour(self):
        self.collector.assessment = assessment(action=NOW-600)
        self.page = self.collector.assessment
        self.item['head']['sha'] = 'b' * 40
        ev = self.evidence()
        self.assertEqual(classify(self.item, self.comments, ev, NOW, self.collector.actors, {}).state, 'WAIT')

    def test_original_comment_time_not_item_update_controls_age(self):
        self.item['updated_at'] = iso(NOW)
        ev = self.evidence()
        self.assertEqual(classify(self.item, self.comments, ev, NOW, self.collector.actors, {}).state, 'DUE')

    def test_shared_record_change_mid_scan_refuses(self):
        self.page += '\nconcurrent update'
        with self.assertRaisesRegex(EvidenceError, 'assessment changed'):
            self.evidence()

    def test_receipt_change_mid_scan_refuses(self):
        self.collector.pages[SLUG] += '\nold version'
        with self.assertRaisesRegex(EvidenceError, 'receipt changed'):
            self.evidence()

    def test_slow_complete_scan_refuses(self):
        self.collector.clock = lambda: NOW+61
        with self.assertRaisesRegex(EvidenceError, 'freshness'):
            self.evidence()

    def test_missing_action_record_cannot_mean_no_action(self):
        self.collector.assessment = self.page = self.page.split('## Action record')[0]
        with self.assertRaisesRegex(EvidenceError, 'dated action record'):
            self.evidence()

    def test_current_objects_refetches_exact_pull_and_comments(self):
        self.gh.req.side_effect = [copy.deepcopy(self.item), copy.deepcopy(self.item)]
        self.gh.pages.return_value = self.comments
        item, comments = self.collector.current_objects(self.item)
        self.assertEqual(item, self.item)
        self.assertEqual(comments, self.comments)
        self.assertTrue(all(call.args[0] == 'GET' for call in self.gh.req.call_args_list))
        self.assertTrue(self.gh.req.call_args.args[1].endswith('/pulls/566'))

    def test_changed_head_during_fetch_refuses(self):
        changed = copy.deepcopy(self.item)
        changed['head']['sha'] = 'b' * 40
        self.gh.req.side_effect = [self.item, changed]
        self.gh.pages.return_value = self.comments
        with self.assertRaisesRegex(EvidenceError, 'changed during collection'):
            self.collector.current_objects(self.item)

    def test_changed_comments_during_fetch_refuse(self):
        self.gh.req.return_value = self.item
        self.gh.pages.side_effect = [self.comments, self.comments + [dict(id=99)]]
        with self.assertRaisesRegex(EvidenceError, 'changed during collection'):
            self.collector.current_objects(self.item)

    def test_initialization_does_not_swallow_read_failure(self):
        self.readers.page.side_effect = OSError('synthetic unavailable canonical source')
        with self.assertRaises(EvidenceError):
            CanonicalCollector(self.gh, 'synthetic/repo', self.readers, clock=lambda: NOW)

    def test_stale_newest_section_cannot_fall_back_to_old_evidence(self):
        with self.assertRaisesRegex(EvidenceError, 'stale'):
            current_section(assessment(NOW-901) + '\n' + assessment(), NOW)

    def test_current_section_future_time_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'future'):
            current_section(assessment(NOW+1), NOW)

    def test_undated_action_is_not_authority(self):
        with self.assertRaisesRegex(EvidenceError, 'unparseable'):
            last_action('## Action record\n- #566 plan to review soon', 566, NOW)


class HostFileBoundaries(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.reader = HostReaders(self.root)
        (self.root / 'lanes/slots').mkdir(parents=True)
        for path, data in [('lane-worker-jobs.json', {}), ('rereview-state.json', {}),
                           ('cursor-state.json', {'issues': {}})]:
            (self.root / path).write_text(json.dumps(data))

    def test_checked_empty_job_sources_are_quiet(self):
        self.assertEqual(self.reader.running({566}), frozenset())

    def scoped_job(self):
        worktree = self.root / 'worktree'
        worktree.mkdir()
        self.reader.proc_root = self.root / 'synthetic-proc'
        proc = self.reader.proc_root / '123'
        proc.mkdir(parents=True)
        (proc / 'cwd').symlink_to(worktree)
        (proc / 'stat').write_text('123 (synthetic) ' + ' '.join(['1'] * 20))
        (proc / 'cmdline').write_bytes(b'/bin/bash\0/host/vk-lane-run.sh\0codex-ubuntu\0synthetic-job\0' + str(worktree).encode() + b'\0')
        (self.root / 'lane-worker-jobs.json').write_text(json.dumps({'synthetic-job': {'item': 566, 'worktree': str(worktree)}}))
        (self.root / 'lanes/slots/job.slot').write_text('tag=synthetic-job\nlane=codex-ubuntu\npid=123\nhost=' + socket.gethostname())
        return proc, worktree

    def test_live_scoped_job_requires_exact_command_worktree_and_head(self):
        self.scoped_job()
        with patch('host_handback_evidence.subprocess.run', return_value=Mock(stdout=SHA+'\n')) as command:
            self.assertEqual(self.reader.running({566}, {566: SHA}), frozenset({566}))
        self.assertEqual(command.call_args.args[0][-2:], ['rev-parse', 'HEAD'])

    def test_live_pid_with_wrong_job_tag_refuses(self):
        proc, _ = self.scoped_job()
        (proc / 'cmdline').write_bytes(b'/host/vk-lane-run.sh\0codex-ubuntu\0other-job\0')
        with self.assertRaisesRegex(EvidenceError, 'exact registered lane job'):
            self.reader.running({566})

    def test_live_pid_with_wrong_worktree_refuses(self):
        proc, _ = self.scoped_job()
        (proc / 'cwd').unlink()
        (proc / 'cwd').symlink_to(self.root)
        with self.assertRaisesRegex(EvidenceError, 'worktree contradicts'):
            self.reader.running({566})

    def test_live_pid_with_old_head_refuses(self):
        self.scoped_job()
        with patch('host_handback_evidence.subprocess.run', return_value=Mock(stdout='b'*40+'\n')):
            with self.assertRaisesRegex(EvidenceError, 'different current head'):
                self.reader.running({566}, {566: SHA})

    def test_missing_worktree_is_not_proof_of_dead_process(self):
        _, worktree = self.scoped_job()
        worktree.rmdir()
        with self.assertRaisesRegex(EvidenceError, 'missing process/worktree evidence'):
            self.reader.running({566})

    def test_unreadable_job_source_is_error(self):
        (self.root / 'lane-worker-jobs.json').unlink()
        with self.assertRaises(FileNotFoundError):
            self.reader.running({566})

    def test_unknown_slot_cannot_disappear_silently(self):
        (self.root / 'lanes/slots/unknown.slot').write_text('tag=unknown\npid=123\n')
        with self.assertRaisesRegex(EvidenceError, 'canonical job mapping'):
            self.reader.running({566})

    def test_active_cloud_flag_is_not_live_process(self):
        (self.root / 'rereview-state.json').write_text(json.dumps({'566': {'active': True}}))
        with self.assertRaisesRegex(EvidenceError, 'authenticated live job proof'):
            self.reader.running({566})

    def test_active_cursor_record_requires_current_run(self):
        (self.root / 'cursor-state.json').write_text(json.dumps({'issues': {'566': {'agent': 'fake'}}}))
        with self.assertRaisesRegex(EvidenceError, 'current run proof'):
            self.reader.running({566})

    def test_missing_craig_reader_refuses(self):
        item = issue()
        item['head'] = {'sha': SHA}
        with self.assertRaisesRegex(EvidenceError, 'dispatch state not found'):
            self.reader.guarded_craig(item, {})

    def test_plain_receipt_prose_does_not_authenticate_file(self):
        with self.assertRaisesRegex(EvidenceError, 'path not found'):
            self.reader.receipt('receipt ready; host review required', 566, SHA)

    def test_receipt_requires_canonical_byte_hash_and_head(self):
        body = '#566\n' + SHA + '\nhost review required'
        digest = hashlib.sha256(body.encode()).hexdigest()
        canonical = '/home/ubishere9995/tsv-work/synthetic/RECEIPT.md ' + SHA
        with patch.object(Path, 'resolve', lambda self, **kw: self), patch.object(Path, 'read_bytes', return_value=body.encode()):
            with self.assertRaisesRegex(EvidenceError, 'hash'):
                self.reader.receipt(canonical, 566, SHA)
            self.assertEqual(self.reader.receipt(canonical + ' ' + digest, 566, SHA), body)
            with self.assertRaisesRegex(EvidenceError, 'current head'):
                self.reader.receipt(canonical + ' ' + digest, 566, 'b' * 40)


class CollectorHandbackEvents(unittest.TestCase):
    COMMENT_BODY = 'receipt ready; host review required'
    ACTOR_ID = 7

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self._scope_patch = patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p))
        self._scope_patch.start()
        self.addCleanup(self._scope_patch.stop)
        self.receipt_body = '#566\n' + SHA + '\nhost review required\n'
        self.receipt_path = self.root / 'tsv-work' / 'synthetic-job' / 'RECEIPT.md'
        self.receipt_path.parent.mkdir(parents=True)
        self.receipt_path.write_text(self.receipt_body)
        self.receipt_sha = hashlib.sha256(self.receipt_body.encode()).hexdigest()
        self.event_path = self.root / 'HOST_HANDOFF.json'
        self.item = issue()
        self.item['head'] = {'sha': SHA}
        self.event_at = NOW - 120
        self.comments = [{
            'id': 42,
            'user': {'login': 'host-supervisor', 'id': self.ACTOR_ID},
            'body': self.COMMENT_BODY,
            'created_at': iso(self.event_at),
            'updated_at': iso(self.event_at),
            'html_url': 'https://example.test/issues/566#issuecomment-42',
            'issue_url': 'https://api.github.com/repos/grampadsbot-sudo/timesyncher/issues/566',
        }]
        self.page = assessment()
        self.readers = HostReaders(self.root, handback_event_paths={566: str(self.event_path)})
        self.readers.page = Mock(side_effect=lambda slug: self.page if slug == ASSESSMENT else '')
        self.readers.running = Mock(return_value=frozenset())
        self.gh = Mock()
        self.gh.req.return_value = {'id': self.ACTOR_ID, 'login': 'host-supervisor'}
        self.collector = CanonicalCollector(self.gh, 'grampadsbot-sudo/timesyncher', self.readers, clock=lambda: NOW)

    def write_event(self, **changes):
        defaults = {
            'path': self.event_path,
            'item': 566,
            'head': SHA,
            'event_at': self.event_at,
            'state': 'pending',
            'receipt_path': str(self.receipt_path),
            'receipt_sha256': self.receipt_sha,
            'gh_actor_id': self.ACTOR_ID,
            'comment_id': 42,
            'comment_body': self.COMMENT_BODY,
            'now': NOW,
        }
        defaults.update(changes)
        return produce_event(**defaults)

    def evidence(self):
        self.write_event()
        return self.collector(self.item, self.comments, NOW)

    def test_authenticated_new_event_routes_to_review(self):
        ev = self.evidence()
        self.assertEqual(classify(self.item, self.comments, ev, NOW, self.collector.actors, {}).state, 'OWNED')
        self.assertIn(42, ev.handback_ids)

    def test_absent_event_file_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'event file not found'):
            self.collector(self.item, self.comments, NOW)

    def test_stale_event_record_refuses(self):
        self.write_event(event_at=NOW - 901)
        with self.assertRaisesRegex(EvidenceError, 'stale'):
            self.collector(self.item, self.comments, NOW)

    def test_wrong_current_head_refuses(self):
        self.write_event()
        self.item['head']['sha'] = 'b' * 40
        with self.assertRaisesRegex(EvidenceError, 'current head'):
            self.collector(self.item, self.comments, NOW)

    def test_wrong_event_item_refuses(self):
        self.write_event(item=574)
        with self.assertRaisesRegex(EvidenceError, 'item mismatch'):
            self.collector(self.item, self.comments, NOW)

    def test_edited_comment_refuses(self):
        self.write_event()
        self.comments[0]['updated_at'] = iso(NOW)
        with self.assertRaisesRegex(EvidenceError, 'edited host comment'):
            self.collector(self.item, self.comments, NOW)

    def test_tampered_receipt_bytes_refuse(self):
        self.write_event()
        self.receipt_path.write_text(self.receipt_body + '\ntamper')
        with self.assertRaisesRegex(EvidenceError, 'receipt bytes'):
            self.collector(self.item, self.comments, NOW)

    def test_comment_id_mismatch_refuses(self):
        self.write_event()
        self.comments[0]['id'] = 43
        with self.assertRaisesRegex(EvidenceError, 'comment id'):
            self.collector(self.item, self.comments, NOW)

    def test_missing_event_does_not_clear_without_host_review(self):
        readers = HostReaders(self.root)
        readers.page = self.readers.page
        readers.running = self.readers.running
        collector = CanonicalCollector(self.gh, 'grampadsbot-sudo/timesyncher', readers, clock=lambda: NOW)
        self.comments[0]['body'] = 'plan only; no host review trigger here'
        ev = collector(self.item, self.comments, NOW)
        self.assertEqual(classify(self.item, self.comments, ev, NOW, collector.actors, {}).state, 'UNRELATED')

    def test_event_root_resolves_per_item_file(self):
        event_dir = self.root / 'events'
        event_dir.mkdir()
        per_item = event_dir / '566.json'
        readers = HostReaders(self.root, handback_event_root=event_dir)
        readers.page = self.readers.page
        readers.running = self.readers.running
        collector = CanonicalCollector(self.gh, 'grampadsbot-sudo/timesyncher', readers, clock=lambda: NOW)
        produce_event(
            per_item,
            item=566,
            head=SHA,
            event_at=self.event_at,
            state='pending',
            receipt_path=str(self.receipt_path),
            receipt_sha256=self.receipt_sha,
            gh_actor_id=self.ACTOR_ID,
            comment_id=42,
            comment_body=self.COMMENT_BODY,
            now=NOW,
        )
        ev = collector(self.item, self.comments, NOW)
        self.assertIn(42, ev.handback_ids)

    def test_event_root_missing_item_file_fail_closed(self):
        event_dir = self.root / 'events'
        event_dir.mkdir()
        readers = HostReaders(self.root, handback_event_root=event_dir)
        readers.page = self.readers.page
        readers.running = self.readers.running
        collector = CanonicalCollector(self.gh, 'grampadsbot-sudo/timesyncher', readers, clock=lambda: NOW)
        with self.assertRaisesRegex(EvidenceError, 'event file not found'):
            collector(self.item, self.comments, NOW)

    def test_historical_host_re_comment_not_used_for_new_event(self):
        self.write_event()
        self.comments.insert(0, {
            'id': 10,
            'user': {'login': 'host-supervisor', 'id': self.ACTOR_ID},
            'body': self.COMMENT_BODY,
            'created_at': iso(NOW - 7200),
            'updated_at': iso(NOW - 7200),
            'html_url': 'https://example.test/issues/566#issuecomment-10',
            'issue_url': 'https://api.github.com/repos/grampadsbot-sudo/timesyncher/issues/566',
        })
        ev = self.collector(self.item, self.comments, NOW)
        self.assertEqual(ev.handback_ids, frozenset({42}))

    def test_reviewed_event_record_refuses(self):
        self.write_event(state='reviewed')
        with self.assertRaisesRegex(EvidenceError, 'unsupported reviewed'):
            self.collector(self.item, self.comments, NOW)

    def test_artificial_old_comment_with_fresh_event_refuses(self):
        self.write_event()
        self.comments[0]['created_at'] = iso(NOW - 3600)
        self.comments[0]['updated_at'] = iso(NOW - 3600)
        with self.assertRaisesRegex(EvidenceError, 'clock skew'):
            self.collector(self.item, self.comments, NOW)

    def test_fresh_event_at_fifteen_minutes_classifies_owned(self):
        self.event_at = NOW - 900
        self.comments[0]['created_at'] = iso(self.event_at)
        self.comments[0]['updated_at'] = iso(self.event_at)
        self.write_event(event_at=self.event_at)
        ev = self.collector(self.item, self.comments, NOW)
        self.assertEqual(classify(self.item, self.comments, ev, NOW, self.collector.actors, {}).state, 'OWNED')

    def test_overdue_event_at_twenty_minutes_refuses_before_classifier(self):
        self.event_at = NOW - 1200
        self.comments[0]['created_at'] = iso(self.event_at)
        self.comments[0]['updated_at'] = iso(self.event_at)
        self.write_event(event_at=self.event_at)
        with self.assertRaisesRegex(EvidenceError, 'stale'):
            self.collector(self.item, self.comments, NOW)


class GuardedCraigLookSend(unittest.TestCase):
    LOOK_SHA = '98e7e1247076d1a3a6b187787274dd04493f1e31'
    SENT_AT = 1792489024.8769073
    SENT_MS = 1792489024876
    LOG_LINE = ('[2026-10-20T09:37:04Z | 2:37 AM PT] PR #560 look request sent via iMac rc=0 RESULT ok '
                'session=synthetic-offline in_history=yes media=6')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'logs').mkdir()

    def write_look(self, n=560, sha=None, media=6, sent_at=None, sent_ms=None, tag=None, extra=None):
        record = {'sent_at': sent_at if sent_at is not None else self.SENT_AT,
                  'sent_ms': sent_ms if sent_ms is not None else self.SENT_MS,
                  'sha': sha if sha is not None else self.LOOK_SHA,
                  'tag': tag or ('tsv-look-pr%d-202610200933' % n),
                  'media': media}
        if extra:
            record.update(extra)
        (self.root / 'state.json').write_text(json.dumps({'look': {str(n): record}}))
        (self.root / 'logs' / 'dispatch-20261020.log').write_text(self.LOG_LINE + '\n')

    def test_authenticated_original_format_succeeds(self):
        self.write_look()
        self.assertTrue(authenticate_guarded_look_send(self.root, 560, self.LOOK_SHA))

    def test_wrong_head_refuses(self):
        self.write_look()
        self.assertFalse(authenticate_guarded_look_send(self.root, 560, 'b' * 40))

    def test_mismatched_media_refuses(self):
        self.write_look(media=5)
        with self.assertRaisesRegex(EvidenceError, 'log event'):
            authenticate_guarded_look_send(self.root, 560, self.LOOK_SHA)

    def test_failed_send_line_refuses(self):
        self.write_look()
        (self.root / 'logs' / 'dispatch-20261020.log').write_text(
            self.LOG_LINE.replace('rc=0 RESULT ok', 'rc=1 RESULT fail') + '\n')
        with self.assertRaisesRegex(EvidenceError, 'log event'):
            authenticate_guarded_look_send(self.root, 560, self.LOOK_SHA)

    def test_missing_original_state_returns_false(self):
        (self.root / 'state.json').write_text(json.dumps({'look': {}}))
        self.assertFalse(authenticate_guarded_look_send(self.root, 560, self.LOOK_SHA))

    def test_missing_dispatch_state_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'dispatch state not found'):
            authenticate_guarded_look_send(self.root, 560, self.LOOK_SHA)

    def test_missing_log_refuses(self):
        self.write_look()
        (self.root / 'logs' / 'dispatch-20261020.log').unlink()
        with self.assertRaisesRegex(EvidenceError, 'dispatch log missing'):
            authenticate_guarded_look_send(self.root, 560, self.LOOK_SHA)

    def test_host_reader_wraps_authentication(self):
        self.write_look()
        reader = HostReaders(self.root)
        item = {'number': 560, 'head': {'sha': self.LOOK_SHA}}
        self.assertTrue(reader.guarded_craig(item, {}))


if __name__ == '__main__':
    unittest.main(verbosity=2)
