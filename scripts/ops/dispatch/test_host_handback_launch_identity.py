"""Unit tests for launch-identity contract helpers."""
import json
import tempfile
import unittest
from pathlib import Path

from host_handback_launch_identity import authenticate_issue_launch_identity
from host_handback_review import EvidenceError

SHA = 'a' * 40
STAMP = '2026-10-22T23:00:00Z'


class LaunchIdentityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.job = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write_identity(self, **overrides):
        record = {
            'version': 1,
            'kind': 'issue',
            'number': 569,
            'issue_updated_at': STAMP,
            'body_sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'base': 'migrate/trek-source',
            'start_sha': SHA,
        }
        record.update(overrides)
        (self.job / 'launch-identity.json').write_text(json.dumps(record) + '\n')

    def test_accepts_benign_updated_at_drift(self):
        self.write_identity()
        item = {'body': '', 'updated_at': '2026-10-23T03:34:23Z',
                'labels': [{'name': 'base:migrate/trek-source'}, {'name': 'status:ready'}]}
        base = authenticate_issue_launch_identity(self.job, 569, STAMP, SHA, item, 'cursor/jev-quality-r20-1128')
        self.assertEqual(base, 'migrate/trek-source')

    def test_refuses_missing_proof(self):
        item = {'body': '', 'updated_at': STAMP, 'labels': []}
        with self.assertRaisesRegex(EvidenceError, 'launch identity proof missing'):
            authenticate_issue_launch_identity(self.job, 569, STAMP, SHA, item, 'cursor/jev-quality-r20-1128')


if __name__ == '__main__':
    unittest.main()
