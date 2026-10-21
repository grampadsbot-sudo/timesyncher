#!/usr/bin/env python3
"""Offline tests for capture_replay_binding (issue #576). Uses synthetic git histories only."""
import hashlib
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'scripts', 'ops', 'dispatch'))
from capture_replay_binding import (  # noqa: E402
    CaptureReplayError,
    CaptureReplayPair,
    build_capture_replay_env,
    build_sha_agrees,
    capture_replay_env_for_pair,
    ensure_immutable_producer_root,
    normalize_live_build_sha,
    pair_from_fixture,
    require_capture_heads,
    require_remote_build_matches,
    sha256_file,
    staging_manifest_inventory_ok,
    timeline_replay_shared_match,
)

GIT_AUTHOR = {
    'GIT_AUTHOR_NAME': 'tsv-test',
    'GIT_AUTHOR_EMAIL': 'tsv-test@local',
    'GIT_COMMITTER_NAME': 'tsv-test',
    'GIT_COMMITTER_EMAIL': 'tsv-test@local',
}

PRODUCER_STUB_V1_SYNC = """import { createHash } from 'node:crypto';
export function prepareFixtureReplaySharedTrip(bytes) {
  const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const parsed = JSON.parse(source.toString('utf8'));
  const payload = Buffer.from(JSON.stringify({ places: parsed.places || [], v: 1 }));
  return {
    payload,
    timelineReplay: {
      policy: 'timeline-explicit-v1',
      source_fixture_sha256: createHash('sha256').update(source).digest('hex'),
      served_payload_sha256: createHash('sha256').update(payload).digest('hex'),
      selected_place_keys: [],
    },
  };
}
"""


def _git(cmd, cwd, env=None):
    merged = {**os.environ, **GIT_AUTHOR, **(env or {})}
    subprocess.run(['git', *cmd], cwd=cwd, check=True, capture_output=True, text=True, env=merged)


def make_synthetic_anchor_with_producers():
    """Two-commit synthetic repo; returns (anchor_dir, sha_a, sha_b, fixture_path, fixture_digest)."""
    anchor = tempfile.mkdtemp(prefix='tsv-anchor-')
    _git(['init'], anchor)
    rel = 'src/vacation/shared-trip-fixture-replay.mjs'
    os.makedirs(os.path.join(anchor, os.path.dirname(rel)), exist_ok=True)
    with open(os.path.join(anchor, rel), 'w') as fh:
        fh.write(PRODUCER_STUB_V1_SYNC)
    _git(['add', '-A'], anchor)
    _git(['commit', '-m', 'producer-a'], anchor)
    sha_a = subprocess.check_output(['git', '-C', anchor, 'rev-parse', 'HEAD'], text=True).strip()
    with open(os.path.join(anchor, rel), 'a') as fh:
        fh.write('\nexport const PRODUCER_TAG = "b";\n')
    _git(['add', rel], anchor)
    _git(['commit', '-m', 'producer-b'], anchor)
    sha_b = subprocess.check_output(['git', '-C', anchor, 'rev-parse', 'HEAD'], text=True).strip()
    fixture = os.path.join(anchor, 'fixture.json')
    with open(fixture, 'w') as fh:
        fh.write('{"places":[{"id":1,"name":"A"}]}')
    digest = sha256_file(fixture)
    return anchor, sha_a, sha_b, fixture, digest


class CaptureReplayBindingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.anchor, cls.sha_a, cls.sha_b, cls.fixture, cls.fixture_digest = make_synthetic_anchor_with_producers()

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['rm', '-rf', cls.anchor], check=False)

    def test_pair_requires_fixture_digest_match(self):
        with self.assertRaises(CaptureReplayError):
            CaptureReplayPair(self.sha_a, self.sha_b, self.fixture, '0' * 64)

    def test_pair_env_splits_render_and_producer(self):
        pair = pair_from_fixture('a' * 40, self.sha_b, self.fixture, self.fixture_digest)
        env = capture_replay_env_for_pair(pair, self.anchor)
        self.assertEqual(env['TSV_CAPTURE_RENDER_HEAD_SHA'], 'a' * 40)
        self.assertEqual(env['TSV_CAPTURE_PRODUCER_HEAD_SHA'], self.sha_b)
        self.assertEqual(env['TSV_CAPTURE_FIXTURE_SHA256'], self.fixture_digest)
        root_head = subprocess.check_output(
            ['git', '-C', env['TSV_CAPTURE_REPO_ROOT'], 'rev-parse', 'HEAD'],
            text=True,
        ).strip()
        self.assertEqual(root_head, self.sha_b)

    def test_same_producer_different_render_heads_share_root(self):
        a = build_capture_replay_env(
            'b' * 40,
            self.sha_b,
            self.anchor,
            fixture_path=self.fixture,
            fixture_sha256=self.fixture_digest,
        )
        b = build_capture_replay_env(
            'c' * 40,
            self.sha_b,
            self.anchor,
            fixture_path=self.fixture,
            fixture_sha256=self.fixture_digest,
        )
        self.assertEqual(a['TSV_CAPTURE_REPO_ROOT'], b['TSV_CAPTURE_REPO_ROOT'])
        self.assertNotEqual(a['TSV_CAPTURE_RENDER_HEAD_SHA'], b['TSV_CAPTURE_RENDER_HEAD_SHA'])

    def test_rejects_prefix_sha(self):
        with self.assertRaises(CaptureReplayError):
            require_capture_heads(self.sha_a[:7], self.sha_b)

    def test_rejects_missing_producer_module(self):
        wrong = 'f' * 40
        with self.assertRaises(CaptureReplayError):
            ensure_immutable_producer_root(self.anchor, wrong)

    def test_two_producer_roots_differ(self):
        a = ensure_immutable_producer_root(self.anchor, self.sha_a)
        b = ensure_immutable_producer_root(self.anchor, self.sha_b)
        self.assertNotEqual(a, b)

    def test_normalize_live_build_sha(self):
        self.assertEqual(normalize_live_build_sha(self.sha_a), self.sha_a)
        self.assertEqual(normalize_live_build_sha(self.sha_a[:7]), self.sha_a[:7])

    def test_full_sha_same_prefix_still_refused(self):
        a = 'abcdef0' + '1' * 33
        b = 'abcdef0' + '2' * 33
        self.assertFalse(build_sha_agrees(a, b))
        self.assertFalse(build_sha_agrees(a[:8], b))

    def test_require_remote_matches_render_not_producer(self):
        render = 'd' * 40
        with mock.patch('capture_replay_binding.fetch_remote_build_sha', return_value=render[:7]):
            require_remote_build_matches('https://example.test', render)
        with mock.patch('capture_replay_binding.fetch_remote_build_sha', return_value=self.sha_b[:7]):
            with self.assertRaises(CaptureReplayError):
                require_remote_build_matches('https://example.test', render)

    def test_build_capture_env_requires_heads_and_fixture(self):
        with self.assertRaises(CaptureReplayError):
            require_capture_heads(None, self.sha_b)
        with self.assertRaises(CaptureReplayError):
            build_capture_replay_env(self.sha_a, self.sha_b, self.anchor, fixture_path=None)

    def test_build_capture_env_requires_remote_base(self):
        with self.assertRaises(CaptureReplayError):
            build_capture_replay_env(
                self.sha_a,
                self.sha_b,
                self.anchor,
                require_remote=True,
                fixture_path=self.fixture,
                fixture_sha256=self.fixture_digest,
            )

    def test_timeline_replay_shared_match_ignores_render_identity(self):
        shared = {
            'policy': 'timeline-explicit-v1',
            'source_fixture_sha256': self.fixture_digest,
            'fixture_sha256': self.fixture_digest,
            'served_payload_sha256': 'd' * 64,
            'selected_place_keys': ['place:1'],
        }
        left = {**shared, 'render_head': 'a' * 40, 'replay_producer_head': self.sha_b}
        right = {**shared, 'render_head': 'b' * 40, 'replay_producer_head': self.sha_b}
        self.assertTrue(timeline_replay_shared_match(left, right))
        self.assertFalse(timeline_replay_shared_match(left, {**right, 'served_payload_sha256': 'e' * 64}))

    def test_staging_manifest_inventory_ok(self):
        shared = {
            'policy': 'timeline-explicit-v1',
            'source_fixture_sha256': self.fixture_digest,
            'fixture_sha256': self.fixture_digest,
            'served_payload_sha256': 'd' * 64,
            'selected_place_keys': [],
            'render_head': 'a' * 40,
            'replay_producer_head': self.sha_b,
        }
        manifest = {'fixture_sha256': self.fixture_digest, 'timeline_replay': shared}
        expected = {**shared, 'render_head': 'c' * 40}
        self.assertTrue(
            staging_manifest_inventory_ok(manifest, expected, self.fixture_digest, 'a' * 40, self.sha_b),
        )

    def test_shared_match_rejects_absent_fields(self):
        self.assertFalse(timeline_replay_shared_match({}, {}))
        self.assertFalse(timeline_replay_shared_match(None, None))
        partial = {'policy': 'timeline-explicit-v1'}
        self.assertFalse(timeline_replay_shared_match(partial, partial))

    def test_staging_inventory_rejects_identity_free_manifest(self):
        manifest = {'fixture_sha256': self.fixture_digest, 'timeline_replay': {'render_head': 'a' * 40}}
        expected = {
            'policy': 'timeline-explicit-v1',
            'source_fixture_sha256': self.fixture_digest,
            'fixture_sha256': self.fixture_digest,
            'served_payload_sha256': 'd' * 64,
            'selected_place_keys': [],
            'render_head': 'c' * 40,
            'replay_producer_head': self.sha_b,
        }
        self.assertFalse(
            staging_manifest_inventory_ok(manifest, expected, self.fixture_digest, 'a' * 40, self.sha_b),
        )


if __name__ == '__main__':
    unittest.main()
