#!/usr/bin/env python3
"""Behavioral tests for dispatcher/staging capture callers (#576 portable)."""
import ast
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DISPATCH_PKG = os.path.join(REPO, 'scripts', 'ops', 'dispatch')
SUPPORT = os.path.join(DISPATCH_PKG, 'support')
sys.path.insert(0, DISPATCH_PKG)

from capture_replay_binding import (  # noqa: E402
    CaptureReplayError,
    require_capture_heads,
    sha256_file,
    staging_manifest_inventory_ok,
    timeline_replay_shared_match,
)

DISPATCHER_SPANS = os.path.join(SUPPORT, 'capture-replay-dispatcher-spans')
PATCH = os.path.join(SUPPORT, 'capture-replay-dispatcher.patch')
MANIFEST = os.path.join(SUPPORT, 'capture-replay-dispatcher-manifest.json')
SHA256SUMS = os.path.join(SUPPORT, 'SHA256SUMS')
CAPTURE_SCRIPT = os.path.join(REPO, 'scripts/ops/capture/capture-staging.sh')
REREVIEW_SRC = os.path.join(DISPATCH_PKG, 'tsv_rereview.py')
STAGING_ORIGIN = 'https://vacation-staging.example.test'
BASE_RENDER = '218a3b39991328c5da4e75601f186065eacbdf45'
CANDIDATE_RENDER = '1141d5ce833b3648b18f114a95ede1af4b03c265'

GIT_AUTHOR = {
    'GIT_AUTHOR_NAME': 'tsv-test',
    'GIT_AUTHOR_EMAIL': 'tsv-test@local',
    'GIT_COMMITTER_NAME': 'tsv-test',
    'GIT_COMMITTER_EMAIL': 'tsv-test@local',
}

PRODUCER_STUB = """import { createHash } from 'node:crypto';
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


def make_synthetic_anchor():
    anchor = tempfile.mkdtemp(prefix='tsv-caller-anchor-')
    rel = 'src/vacation/shared-trip-fixture-replay.mjs'
    os.makedirs(os.path.join(anchor, os.path.dirname(rel)), exist_ok=True)
    with open(os.path.join(anchor, rel), 'w') as fh:
        fh.write(PRODUCER_STUB)
    _git(['init'], anchor)
    _git(['add', '-A'], anchor)
    _git(['commit', '-m', 'producer'], anchor)
    producer_sha = subprocess.check_output(['git', '-C', anchor, 'rev-parse', 'HEAD'], text=True).strip()
    fixture = os.path.join(anchor, 'fixture.json')
    with open(fixture, 'w') as fh:
        fh.write('{"places":[{"id":1,"name":"A"}],"thingOverrides":{}}')
    return anchor, producer_sha, fixture


def _sha256_path(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _apply_dispatcher_patch(spans_text: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / 'capture-replay-dispatcher-spans'
        patch = Path(tmp) / 'dispatcher.patch'
        src.write_text(spans_text)
        patch.write_text(Path(PATCH).read_text())
        proc = subprocess.run(
            ['patch', '-p0', str(src), '-i', str(patch)],
            capture_output=True,
            text=True,
            cwd=tmp,
        )
        if proc.returncode != 0:
            raise RuntimeError('patch failed: %s' % (proc.stderr or proc.stdout))
        return src.read_text()


def _function_sha256_map(source: str):
    module = ast.parse(source)
    lines = source.splitlines(keepends=True)
    out = {}
    for node in module.body:
        if isinstance(node, ast.FunctionDef):
            span = ''.join(lines[node.lineno - 1 : node.end_lineno])
            out[node.name] = hashlib.sha256(span.encode()).hexdigest()
    return out


def load_patched_dispatcher_functions(anchor, producer_sha, fixture_path, *names):
    patched = _apply_dispatcher_patch(Path(DISPATCHER_SPANS).read_text())
    module = ast.parse(patched)
    funcs = [n for n in module.body if isinstance(n, ast.FunctionDef) and n.name in names]
    run_calls = []

    def fake_run(cmd, env=None, timeout=None):
        run_calls.append({'cmd': list(cmd), 'env': dict(env or {})})
        return 0, '', ''

    popen_calls = []

    class _FakeSrv:
        def terminate(self):
            return None

    def fake_popen(*_args, **_kwargs):
        popen_calls.append(1)
        return _FakeSrv()

    namespace = {
        '__file__': os.path.join(DISPATCH_PKG, 'tsv_dispatch.py'),
        '__name__': 'tsv_dispatch',
        'os': os,
        'sys': sys,
        'subprocess': subprocess,
        'time': type('time', (), {'sleep': staticmethod(lambda _s: None)}),
        're': __import__('re'),
        'json': __import__('json'),
        'PR_SRC': anchor,
        'STAGING_ORIGIN': STAGING_ORIGIN,
        'D': tempfile.mkdtemp(prefix='tsv-dispatch-test-'),
        'HOME': os.environ.get('HOME', '/tmp'),
        'CAPTURE_SCRIPT': CAPTURE_SCRIPT,
        'CAPTURE_FIXTURE': fixture_path,
        'PR_RENDER': '/bin/true',
        'SERVE_DIST': '/bin/true',
        'LOCAL_PORT': 31999,
        'BASELINES': '/tmp/baselines',
        'DRY': True,
        'REPO': 'test/repo',
        'LAST_CAPTURE': {},
        'run': fake_run,
    }
    namespace['subprocess'] = type(
        'subprocess',
        (),
        {'run': staticmethod(subprocess.run), 'Popen': staticmethod(fake_popen), 'DEVNULL': subprocess.DEVNULL},
    )
    if 'capture_and_compare' in names:
        namespace['data_precheck'] = lambda *a, **k: (None, None)
        namespace['pr_file_paths'] = lambda pr_files: []
        namespace['ui_files'] = lambda paths: False
    exec(compile(ast.Module(body=funcs, type_ignores=[]), 'tsv_dispatch.py', 'exec'), namespace)
    namespace['_run_calls'] = run_calls
    namespace['_popen_calls'] = popen_calls
    return namespace


def load_rereview_staging_capture():
    source = Path(REREVIEW_SRC).read_text()
    module = ast.parse(source)
    names = {'staging_capture', '_staging_has_inventory'}
    funcs = [n for n in module.body if isinstance(n, ast.FunctionDef) and n.name in names]
    namespace = {
        '__file__': REREVIEW_SRC,
        'os': os,
        'sys': sys,
        'json': json,
        're': __import__('re'),
        'subprocess': subprocess,
        'D': tempfile.mkdtemp(prefix='tsv-rereview-test-'),
        'PR_SRC': '',
        'STAGING_ORIGIN': STAGING_ORIGIN,
        'REPO': 'test/repo',
        'CaptureReplayError': CaptureReplayError,
        'capture_subprocess_env': __import__('capture_replay_binding').capture_subprocess_env,
        'staging_manifest_inventory_ok': staging_manifest_inventory_ok,
        'CAPTURE_STAGING': CAPTURE_SCRIPT,
    }
    exec(compile(ast.Module(body=funcs, type_ignores=[]), 'tsv_rereview.py', 'exec'), namespace)
    return namespace


class CaptureReplayCallersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.anchor, cls.producer_sha, cls.fixture = make_synthetic_anchor()
        cls.fixture_digest = sha256_file(cls.fixture)

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['rm', '-rf', cls.anchor], check=False)

    def test_support_artifacts_sha256_and_patch(self):
        sums = Path(SHA256SUMS).read_text().splitlines()
        by_name = {}
        for line in sums:
            digest, name = line.split(None, 1)
            by_name[Path(name).name] = digest
        self.assertEqual(by_name['capture-replay-dispatcher-spans'], _sha256_path(DISPATCHER_SPANS))
        self.assertEqual(by_name['capture-replay-dispatcher.patch'], _sha256_path(PATCH))
        self.assertEqual(by_name['capture-replay-dispatcher-manifest.json'], _sha256_path(MANIFEST))
        manifest = json.loads(Path(MANIFEST).read_text())
        self.assertEqual(by_name['runtime_dispatcher_sha256'], manifest['runtime_dispatcher_sha256'])
        patched = _apply_dispatcher_patch(Path(DISPATCHER_SPANS).read_text())
        self.assertIn('def _capture_replay_env(', patched)
        self.assertIn('def staging_capture(out, render_head', patched)
        got = _function_sha256_map(patched)
        for name, expected in manifest['patched_function_sha256'].items():
            self.assertEqual(got[name], expected, name)

    def test_dispatcher_refuses_missing_heads(self):
        with self.assertRaises(CaptureReplayError):
            require_capture_heads(None, 'a' * 40)
        with self.assertRaises(CaptureReplayError):
            require_capture_heads('a' * 40, None)

    def test_patched_staging_capture_requires_fixture_before_subprocess(self):
        ns = load_patched_dispatcher_functions(self.anchor, self.producer_sha, self.fixture, 'staging_capture')
        out, err = ns['staging_capture']('/tmp/staging-out', CANDIDATE_RENDER, self.producer_sha, fixture_path=None)
        self.assertIsNone(out)
        self.assertIn('fixture_path required', err)
        self.assertEqual(ns['_run_calls'], [])

    def test_patched_capture_and_compare_refuses_missing_heads(self):
        ns = load_patched_dispatcher_functions(self.anchor, self.producer_sha, self.fixture, 'capture_and_compare')
        res, err = ns['capture_and_compare'](
            '/tmp/compare-out', 'http://127.0.0.1:9', None, None, 'note', capture_fixture=self.fixture,
        )
        self.assertIsNone(res)
        self.assertIn('render_head and replay_producer_head required', err)
        self.assertEqual(ns['_run_calls'], [])

    def test_patched_capture_and_compare_argv_and_env_explicit(self):
        ns = load_patched_dispatcher_functions(
            self.anchor, self.producer_sha, self.fixture, '_capture_replay_env', 'capture_and_compare',
        )
        bad_base = 'https://evil-contaminated.example.test'
        with mock.patch.dict(
            os.environ,
            {
                'TSV_CAPTURE_BASE': bad_base,
                'TSV_CAPTURE_RENDER_HEAD_SHA': 'f' * 40,
                'TSV_CAPTURE_PRODUCER_HEAD_SHA': 'e' * 40,
            },
            clear=False,
        ):
            res, err = ns['capture_and_compare'](
                '/tmp/compare-out',
                'http://127.0.0.1:9',
                None,
                None,
                'note',
                structure=True,
                capture_fixture=self.fixture,
                render_head=CANDIDATE_RENDER,
                replay_producer_head=self.producer_sha,
            )
        self.assertIsNone(err)
        self.assertEqual(res.get('overall'), 'SKIPPED')
        self.assertEqual(len(ns['_run_calls']), 1)
        call = ns['_run_calls'][0]
        self.assertEqual(
            call['cmd'],
            [CAPTURE_SCRIPT, '/tmp/compare-out', self.producer_sha, CANDIDATE_RENDER],
        )
        self.assertEqual(call['env']['TSV_CAPTURE_BASE'], 'http://127.0.0.1:9')
        self.assertEqual(call['env']['TSV_CAPTURE_RENDER_HEAD_SHA'], CANDIDATE_RENDER)
        self.assertEqual(call['env']['TSV_CAPTURE_PRODUCER_HEAD_SHA'], self.producer_sha)
        self.assertEqual(call['env']['TSV_CAPTURE_FIXTURE_SHA256'], self.fixture_digest)
        self.assertEqual(call['env']['TSV_CAPTURE_FIXTURE'], self.fixture)

    def test_patched_local_capture_refuses_missing_sha(self):
        ns = load_patched_dispatcher_functions(self.anchor, self.producer_sha, self.fixture, 'local_capture')
        err = ns['local_capture']('not-a-sha', 'main', '/tmp/local-out', fixture=self.fixture)
        self.assertIn('render_head and replay_producer_head required', err)
        capture_calls = [c for c in ns['_run_calls'] if c['cmd'] and c['cmd'][0] == CAPTURE_SCRIPT]
        self.assertEqual(capture_calls, [])

    def test_patched_local_capture_argv_and_env_explicit(self):
        ns = load_patched_dispatcher_functions(
            self.anchor, self.producer_sha, self.fixture, '_capture_replay_env', 'local_capture',
        )
        sha = self.producer_sha
        with mock.patch.dict(
            os.environ,
            {'TSV_CAPTURE_BASE': 'https://evil-contaminated.example.test', 'TSV_CAPTURE_API_ORIGIN': 'https://wrong.example.test'},
            clear=False,
        ):
            err = ns['local_capture'](sha, 'main', '/tmp/local-out', fixture=self.fixture)
        self.assertIsNone(err)
        self.assertEqual(len(ns['_run_calls']), 2)
        capture_call = ns['_run_calls'][1]
        self.assertEqual(capture_call['cmd'], [CAPTURE_SCRIPT, '/tmp/local-out', sha, sha])
        self.assertEqual(capture_call['env']['TSV_CAPTURE_BASE'], 'http://127.0.0.1:%d' % ns['LOCAL_PORT'])
        self.assertEqual(capture_call['env']['TSV_CAPTURE_API_ORIGIN'], STAGING_ORIGIN)
        self.assertEqual(capture_call['env']['TSV_CAPTURE_RENDER_HEAD_SHA'], sha)
        self.assertEqual(capture_call['env']['TSV_CAPTURE_PRODUCER_HEAD_SHA'], sha)
        self.assertEqual(capture_call['env']['TSV_CAPTURE_FIXTURE_SHA256'], self.fixture_digest)
        self.assertEqual(capture_call['env']['TSV_CAPTURE_FIXTURE'], self.fixture)

    def test_patched_staging_capture_argv_and_env_explicit(self):
        ns = load_patched_dispatcher_functions(
            self.anchor, self.producer_sha, self.fixture, '_capture_replay_env', 'staging_capture',
        )
        with mock.patch('capture_replay_binding.fetch_remote_build_sha', return_value=CANDIDATE_RENDER[:7]):
            out, err = ns['staging_capture'](
                '/tmp/staging-out', CANDIDATE_RENDER, self.producer_sha, fixture_path=self.fixture,
            )
        self.assertIsNone(err)
        self.assertEqual(out, os.path.abspath('/tmp/staging-out'))
        self.assertEqual(len(ns['_run_calls']), 1)
        call = ns['_run_calls'][0]
        self.assertEqual(
            call['cmd'][:4],
            [CAPTURE_SCRIPT, os.path.abspath('/tmp/staging-out'), self.producer_sha, CANDIDATE_RENDER],
        )
        self.assertEqual(call['env']['TSV_CAPTURE_RENDER_HEAD_SHA'], CANDIDATE_RENDER)
        self.assertEqual(call['env']['TSV_CAPTURE_PRODUCER_HEAD_SHA'], self.producer_sha)
        self.assertEqual(call['env']['TSV_CAPTURE_FIXTURE_SHA256'], self.fixture_digest)
        self.assertEqual(call['env']['TSV_CAPTURE_FIXTURE'], self.fixture)

    def test_patched_capture_replay_env_refuses_missing_fixture(self):
        ns = load_patched_dispatcher_functions(self.anchor, self.producer_sha, self.fixture, '_capture_replay_env')
        with self.assertRaises(ValueError):
            ns['_capture_replay_env'](
                CANDIDATE_RENDER,
                self.producer_sha,
                remote_base='http://127.0.0.1:9',
                require_remote=False,
                fixture_path=None,
            )

    def test_patched_capture_replay_env_rejects_missing_fixture_file(self):
        ns = load_patched_dispatcher_functions(self.anchor, self.producer_sha, self.fixture, '_capture_replay_env')
        with self.assertRaises(ValueError):
            ns['_capture_replay_env'](
                CANDIDATE_RENDER,
                self.producer_sha,
                remote_base='http://127.0.0.1:9',
                require_remote=False,
                fixture_path=os.path.join(self.anchor, 'no-such-fixture.json'),
            )

    def test_staging_inventory_allows_different_render_heads(self):
        shared = {
            'policy': 'timeline-explicit-v1',
            'source_fixture_sha256': self.fixture_digest,
            'fixture_sha256': self.fixture_digest,
            'served_payload_sha256': 'a' * 64,
            'selected_place_keys': ['place:1'],
        }
        candidate_binding = {**shared, 'render_head': CANDIDATE_RENDER, 'replay_producer_head': self.producer_sha}
        staging_binding = {**shared, 'render_head': BASE_RENDER, 'replay_producer_head': self.producer_sha}
        manifest = {'fixture_sha256': self.fixture_digest, 'timeline_replay': staging_binding}
        self.assertTrue(
            staging_manifest_inventory_ok(manifest, candidate_binding, self.fixture_digest, BASE_RENDER, self.producer_sha),
        )
        bad = dict(manifest)
        bad['timeline_replay'] = {**staging_binding, 'render_head': CANDIDATE_RENDER}
        self.assertFalse(
            staging_manifest_inventory_ok(bad, candidate_binding, self.fixture_digest, BASE_RENDER, self.producer_sha),
        )

    def test_shared_match_rejects_empty_identity(self):
        self.assertFalse(timeline_replay_shared_match({}, {}))
        self.assertFalse(timeline_replay_shared_match({'policy': 'timeline-explicit-v1'}, {'policy': 'timeline-explicit-v1'}))

    def test_staging_inventory_rejects_malformed_manifest(self):
        shared = {
            'policy': 'timeline-explicit-v1',
            'source_fixture_sha256': self.fixture_digest,
            'fixture_sha256': self.fixture_digest,
            'served_payload_sha256': 'a' * 64,
            'selected_place_keys': [],
            'render_head': BASE_RENDER,
            'replay_producer_head': self.producer_sha,
        }
        expected = {**shared, 'render_head': CANDIDATE_RENDER}
        self.assertFalse(staging_manifest_inventory_ok({}, expected, self.fixture_digest, BASE_RENDER, self.producer_sha))
        self.assertFalse(
            staging_manifest_inventory_ok(
                {'fixture_sha256': self.fixture_digest, 'timeline_replay': {}},
                expected,
                self.fixture_digest,
                BASE_RENDER,
                self.producer_sha,
            ),
        )
        wrong_producer = {**shared, 'replay_producer_head': 'f' * 40}
        self.assertFalse(
            staging_manifest_inventory_ok(
                {'fixture_sha256': self.fixture_digest, 'timeline_replay': shared},
                expected,
                self.fixture_digest,
                BASE_RENDER,
                'f' * 40,
            ),
        )

    def test_route_protected_unchanged_in_dispatcher_spans(self):
        src = Path(DISPATCHER_SPANS).read_text()
        start = src.index('def route_protected')
        chunk = src[start : start + 1200]
        self.assertIn('PROTECTED_HOLD', chunk)
        self.assertNotIn('capture_replay', chunk)
        manifest = json.loads(Path(MANIFEST).read_text())
        self.assertEqual(manifest['patched_function_sha256']['route_protected'], _function_sha256_map(src)['route_protected'])

    def test_rereview_staging_capture_refuses_missing_fixture(self):
        ns = load_rereview_staging_capture()
        ctx = mock.Mock()
        ctx.api.return_value = {'object': {'sha': BASE_RENDER}}
        ctx.dry = True
        pr = {'base': {'ref': 'main'}, 'head': {'sha': self.producer_sha}}
        out, err = ns['staging_capture'](ctx, pr, None, cand_dir=tempfile.mkdtemp())
        self.assertIsNone(out)
        self.assertIn('fixture unknown', err)

    def test_rereview_staging_capture_rejects_invalid_candidate_binding(self):
        ns = load_rereview_staging_capture()
        ctx = mock.Mock()
        ctx.api.return_value = {'object': {'sha': BASE_RENDER}}
        ctx.dry = True
        pr = {'base': {'ref': 'main'}, 'head': {'sha': self.producer_sha}}
        cand = tempfile.mkdtemp()
        with open(os.path.join(cand, 'capture-manifest.json'), 'w') as fh:
            json.dump({'fixture_sha256': self.fixture_digest, 'timeline_replay': {}}, fh)
        out, err = ns['staging_capture'](ctx, pr, self.fixture, cand_dir=cand)
        self.assertIsNone(out)
        self.assertIn('binding missing or invalid', err)


if __name__ == '__main__':
    unittest.main()
