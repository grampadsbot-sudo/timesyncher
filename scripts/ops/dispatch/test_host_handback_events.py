"""Host handback event producer/reader: synthetic fixtures, no live GH."""
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from host_handback_events import (
    EventError,
    digest_comment_body,
    is_legacy_record,
    load_event,
    produce_event,
    verify_event,
    verify_receipt_binding,
)

HEAD = '04d05a0445ed4b94f7115c0bd6d5fc5782fae4d8'
NOW = 1_800_000_000.0
ACTOR = 259964401
COMMENT_ID = 6297082727


def scoped_receipt(root, body):
    path = root / 'tsv-work' / 'synthetic-job' / 'RECEIPT.md'
    path.parent.mkdir(parents=True)
    path.write_text(body)
    return path


class HostHandbackEvents(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.receipt_body = '#569\n' + HEAD + '\nhost review required\n'
        self.receipt_path = scoped_receipt(self.root, self.receipt_body)
        self.receipt_sha = hashlib.sha256(self.receipt_body.encode()).hexdigest()
        self.comment_body = 'Independent review continues; host review required.'
        self.event_path = self.root / 'HOST_HANDOFF.json'

    def comment(self, at=None, **changes):
        stamp = datetime.fromtimestamp(at if at is not None else NOW - 120, timezone.utc).strftime(
            '%Y-%m-%dT%H:%M:%SZ')
        base = {
            'id': COMMENT_ID,
            'user': {'id': ACTOR, 'login': 'grampadsbot-sudo'},
            'issue_url': 'https://api.github.com/repos/grampadsbot-sudo/timesyncher/issues/569',
            'body': self.comment_body,
            'created_at': stamp,
            'updated_at': stamp,
        }
        base.update(changes)
        return base

    def write_event(self, **kw):
        defaults = {
            'path': self.event_path,
            'item': 569,
            'head': HEAD,
            'event_at': NOW - 120,
            'state': 'pending',
            'receipt_path': str(self.receipt_path),
            'receipt_sha256': self.receipt_sha,
            'gh_actor_id': ACTOR,
            'comment_id': COMMENT_ID,
            'comment_body': self.comment_body,
            'now': NOW,
        }
        defaults.update(kw)
        with patch('host_handback_events.validate_scoped_receipt_path') as scoped:
            scoped.side_effect = lambda p: Path(p)
            return produce_event(**defaults)

    def test_roundtrip_producer_and_reader(self):
        record = self.write_event()
        loaded = load_event(self.event_path)
        self.assertEqual(record, loaded)
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            verify_event(loaded, self.comment(), HEAD, now=NOW)
            verify_receipt_binding(loaded)

    def test_legacy_host_handoff_refused(self):
        legacy = {'at': NOW, 'message': 'done', 'receipt_exists': True}
        self.assertTrue(is_legacy_record(legacy))
        self.event_path.write_text(json.dumps(legacy))
        with self.assertRaisesRegex(EventError, 'legacy'):
            load_event(self.event_path)

    def test_tampered_receipt_bytes_refused(self):
        record = self.write_event()
        self.receipt_path.write_text(self.receipt_body + '\ntamper')
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'receipt bytes'):
                verify_event(record, self.comment(), HEAD, now=NOW)

    def test_tampered_comment_body_refused(self):
        record = self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'comment body'):
                verify_event(record, self.comment(body=self.comment_body + 'x'), HEAD, now=NOW)

    def test_wrong_current_head_refused(self):
        record = self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'current head'):
                verify_event(record, self.comment(), 'b' * 40, now=NOW)

    def test_edited_comment_refused(self):
        record = self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'edited host comment'):
                verify_event(record, self.comment(updated_at='2026-10-20T18:00:00Z'), HEAD, now=NOW)

    def test_future_event_timestamp_refused(self):
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'future'):
                self.write_event(event_at=NOW + 120)

    def test_future_event_at_on_verify_refused(self):
        record = dict(self.write_event())
        record['event_at'] = NOW + 120
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'future'):
                verify_event(record, self.comment(), HEAD, now=NOW)

    def test_comment_id_mismatch_refused(self):
        record = self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'comment id'):
                verify_event(record, self.comment(id=COMMENT_ID + 1), HEAD, now=NOW)

    def test_actor_id_mismatch_refused(self):
        record = self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'actor id'):
                verify_event(record, self.comment(user={'id': ACTOR + 1}), HEAD, now=NOW)

    def test_producer_refuses_receipt_hash_mismatch(self):
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'receipt_sha256'):
                self.write_event(receipt_sha256='a' * 64)

    def test_producer_refuses_overwrite(self):
        self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'overwrite'):
                self.write_event()

    def test_wrong_item_comment_refused(self):
        record = dict(self.write_event(), item=574)
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'comment issue'):
                verify_event(record, self.comment(), HEAD, now=NOW)

    def test_stale_event_refused(self):
        record = dict(self.write_event(), event_at=NOW - 901)
        with self.assertRaisesRegex(EventError, 'stale'):
            verify_event(record, self.comment(at=NOW - 901), HEAD, now=NOW)

    def test_event_at_comment_created_at_skew_refused(self):
        record = self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'clock skew'):
                verify_event(record, self.comment(at=NOW - 3600), HEAD, now=NOW)

    def test_non_utc_comment_timestamp_refused(self):
        record = self.write_event()
        with patch('host_handback_events.validate_scoped_receipt_path', lambda p: Path(p)):
            with self.assertRaisesRegex(EventError, 'exact UTC'):
                verify_event(record, self.comment(created_at='not-a-timestamp', updated_at='not-a-timestamp'),
                             HEAD, now=NOW)

    def test_freshness_cannot_be_disabled(self):
        record = self.write_event()
        with self.assertRaisesRegex(EventError, 'freshness window'):
            verify_event(record, self.comment(), HEAD, now=NOW, max_age=999999)

    def test_digest_is_stable(self):
        self.assertEqual(digest_comment_body(self.comment_body),
                         hashlib.sha256(self.comment_body.encode()).hexdigest())


if __name__ == '__main__':
    unittest.main(verbosity=2)
