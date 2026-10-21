"""Per-invocation Gate B capture fixture-replay producer binding (issue #576)."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

FULL_SHA_RE = re.compile(r'^[0-9a-f]{40}$')
FIXTURE_SHA_RE = re.compile(r'^[0-9a-f]{64}$')

TIMELINE_REPLAY_SHARED_KEYS = (
    'policy',
    'source_fixture_sha256',
    'fixture_sha256',
    'served_payload_sha256',
    'selected_place_keys',
)


class CaptureReplayError(ValueError):
    pass


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def require_fixture_sha256(raw: str, label: str = 'fixture_sha256') -> str:
    text = (raw or '').strip().lower()
    if not FIXTURE_SHA_RE.match(text):
        raise CaptureReplayError('capture replay requires full 64-char %s' % label)
    return text


@dataclass(frozen=True)
class CaptureReplayPair:
    """Renderer build identity is separate from fixture-replay producer identity (#576)."""

    render_head: str
    replay_producer_head: str
    fixture_path: str
    fixture_sha256: str

    def __post_init__(self) -> None:
        object.__setattr__(self, 'render_head', require_full_sha(self.render_head, 'render_head'))
        object.__setattr__(self, 'replay_producer_head', require_full_sha(self.replay_producer_head, 'replay_producer_head'))
        fixture_path = (self.fixture_path or '').strip()
        if not fixture_path:
            raise CaptureReplayError('capture replay requires fixture_path')
        if not Path(fixture_path).is_file():
            raise CaptureReplayError('capture replay fixture missing: %s' % fixture_path)
        object.__setattr__(self, 'fixture_path', fixture_path)
        expected = require_fixture_sha256(self.fixture_sha256)
        actual = sha256_file(fixture_path)
        if actual != expected:
            raise CaptureReplayError(
                'capture replay fixture digest mismatch for %s (expected %s got %s)' % (fixture_path, expected, actual),
            )
        object.__setattr__(self, 'fixture_sha256', expected)

    def as_manifest_dict(self) -> dict[str, Any]:
        return {
            'render_head': self.render_head,
            'replay_producer_head': self.replay_producer_head,
            'fixture': self.fixture_path,
            'fixture_sha256': self.fixture_sha256,
        }


def require_full_sha(raw: str, label: str) -> str:
    text = (raw or '').strip().lower()
    if not FULL_SHA_RE.match(text):
        raise CaptureReplayError('capture replay requires full 40-char %s sha' % label)
    return text


def timeline_replay_shared_identity_valid(binding: dict[str, Any] | None) -> bool:
    """Every shared replay field must be present; absent values never establish identity (#576)."""
    if not isinstance(binding, dict):
        return False
    if binding.get('policy') != 'timeline-explicit-v1':
        return False
    for key in ('source_fixture_sha256', 'fixture_sha256', 'served_payload_sha256'):
        val = binding.get(key)
        if not isinstance(val, str) or not FIXTURE_SHA_RE.match(val.strip().lower()):
            return False
    selected = binding.get('selected_place_keys')
    if not isinstance(selected, list):
        return False
    return True


def timeline_replay_shared_fields(binding: dict[str, Any] | None) -> dict[str, Any] | None:
    """Producer/payload/fixture/selection identity; render_head is compared separately (#576)."""
    if not timeline_replay_shared_identity_valid(binding):
        return None
    src = binding
    return {key: src.get(key) for key in TIMELINE_REPLAY_SHARED_KEYS}


def timeline_replay_shared_match(left: dict[str, Any] | None, right: dict[str, Any] | None) -> bool:
    left_fields = timeline_replay_shared_fields(left)
    right_fields = timeline_replay_shared_fields(right)
    if left_fields is None or right_fields is None:
        return False
    return left_fields == right_fields


def staging_manifest_inventory_ok(
    manifest: dict[str, Any],
    expected_binding: dict[str, Any],
    fixture_sha256: str,
    render_head: str,
    replay_producer_head: str,
) -> bool:
    try:
        fixture_sha = require_fixture_sha256(fixture_sha256)
        render = require_full_sha(render_head, 'render_head')
        producer = require_full_sha(replay_producer_head, 'replay_producer_head')
    except CaptureReplayError:
        return False
    if not timeline_replay_shared_identity_valid(expected_binding):
        return False
    if expected_binding.get('replay_producer_head') != producer:
        return False
    binding = manifest.get('timeline_replay')
    if not isinstance(binding, dict):
        return False
    if manifest.get('fixture_sha256') != fixture_sha:
        return False
    return (
        timeline_replay_shared_match(binding, expected_binding)
        and binding.get('render_head') == render
        and binding.get('replay_producer_head') == producer
    )


def require_capture_heads(render_head: str | None, replay_producer_head: str | None) -> tuple[str, str]:
    """Fail closed when dispatcher callers omit explicit render/producer identities."""
    if not render_head or not replay_producer_head:
        raise CaptureReplayError('capture replay requires render_head and replay_producer_head')
    return require_full_sha(render_head, 'render_head'), require_full_sha(replay_producer_head, 'replay_producer_head')


def _run_git(args, cwd, timeout=120):
    proc = subprocess.run(
        ['git', *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or '').strip()[-240:]
        raise CaptureReplayError('git %s failed in %s: %s' % (' '.join(args[:3]), cwd, tail))
    return proc.stdout.strip()


def git_object_root(anchor_worktree: str) -> Path:
    """Main git directory that owns worktrees for anchor_worktree."""
    anchor = Path(anchor_worktree).resolve()
    common = _run_git(['rev-parse', '--git-common-dir'], anchor)
    path = Path(common)
    if not path.is_absolute():
        path = (anchor / path).resolve()
    if path.name == '.git':
        return path.parent
    return path


def producer_root_cache(anchor_worktree: str) -> Path:
    env = os.environ.get('TSV_CAPTURE_PRODUCER_ROOT_CACHE', '').strip()
    if env:
        return Path(env)
    return git_object_root(anchor_worktree) / 'capture-producer-roots'


def ensure_immutable_producer_root(anchor_worktree: str, producer_sha: str) -> str:
    """Detached worktree at producer_sha; reused when already present."""
    sha = require_full_sha(producer_sha, 'replay_producer_head')
    anchor = str(Path(anchor_worktree).resolve())
    if not Path(anchor).is_dir():
        raise CaptureReplayError('capture replay anchor worktree missing: %s' % anchor)
    object_root = git_object_root(anchor)
    _run_git(['cat-file', '-e', '%s^{commit}' % sha], object_root)
    root = producer_root_cache(anchor) / sha
    producer_file = root / 'src' / 'vacation' / 'shared-trip-fixture-replay.mjs'
    if root.is_dir():
        if _run_git(['status', '--porcelain', '--untracked-files=no'], root):
            raise CaptureReplayError('capture replay: producer root has tracked modifications')
        head = _run_git(['rev-parse', 'HEAD'], root)
        if head != sha:
            raise CaptureReplayError(
                'capture replay: corrupt producer root %s HEAD %s !== %s' % (root, head, sha),
            )
        if not producer_file.is_file():
            raise CaptureReplayError('capture replay producer missing at %s' % producer_file)
        return str(root)
    root.parent.mkdir(parents=True, exist_ok=True)
    _run_git(['worktree', 'add', '--detach', str(root), sha], object_root)
    if not producer_file.is_file():
        raise CaptureReplayError('capture replay producer missing at %s' % producer_file)
    return str(root)


def capture_replay_env(replay_producer_head: str, anchor_worktree: str | None = None) -> dict[str, str]:
    """Env for timeline-replay.mjs; prepares an isolated producer checkout."""
    sha = require_full_sha(replay_producer_head, 'replay_producer_head')
    anchor = (anchor_worktree or os.environ.get('TSV_CAPTURE_ANCHOR_WORKTREE') or '').strip()
    if not anchor:
        raise CaptureReplayError('capture replay requires anchor_worktree (PR_SRC or TSV_CAPTURE_ANCHOR_WORKTREE)')
    root = ensure_immutable_producer_root(anchor, sha)
    return {
        'TSV_CAPTURE_REPO_ROOT': root,
        'TSV_CAPTURE_PRODUCER_HEAD_SHA': sha,
    }


def capture_replay_env_for_pair(pair: CaptureReplayPair, anchor_worktree: str | None = None) -> dict[str, str]:
    env = capture_replay_env(pair.replay_producer_head, anchor_worktree)
    env['TSV_CAPTURE_RENDER_HEAD_SHA'] = pair.render_head
    env['TSV_CAPTURE_FIXTURE'] = pair.fixture_path
    env['TSV_CAPTURE_FIXTURE_SHA256'] = pair.fixture_sha256
    return env


def normalize_live_build_sha(raw: str) -> str:
    text = (raw or '').strip().lower()
    if FULL_SHA_RE.match(text):
        return text
    if re.fullmatch(r'[0-9a-f]{7,40}', text):
        return text
    return ''


def fetch_remote_build_sha(base_url: str, timeout: float = 15.0) -> str:
    url = base_url.rstrip('/') + '/api/version'
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            body = resp.read().decode('utf-8', 'replace')
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise CaptureReplayError('capture replay: cannot read served build from %s (%s)' % (url, type(exc).__name__))
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise CaptureReplayError('capture replay: served build JSON unreadable from %s' % url)
    for key in ('commit', 'sha', 'version'):
        val = normalize_live_build_sha(str(data.get(key) or ''))
        if val:
            return val
    raise CaptureReplayError('capture replay: served build sha unknown from %s' % url)


def build_sha_agrees(live: str, expected: str) -> bool:
    if not live or not expected:
        return False
    if live == expected:
        return True
    return len(live) >= 7 and len(live) < 40 and len(expected) == 40 and expected.startswith(live)


def require_remote_build_matches(base_url: str, render_head: str, timeout: float = 15.0) -> None:
    """Fail closed when staging (or other remote base) does not report render_head."""
    expected = require_full_sha(render_head, 'render_head')
    live = fetch_remote_build_sha(base_url, timeout=timeout)
    if build_sha_agrees(live, expected):
        return
    raise CaptureReplayError(
        'capture replay: served build %s does not match render_head %s' % (live or '?', expected),
    )


def pair_from_fixture(
    render_head: str,
    replay_producer_head: str,
    fixture_path: str,
    fixture_sha256: str | None = None,
) -> CaptureReplayPair:
    path = (fixture_path or '').strip()
    if not path or not Path(path).is_file():
        raise CaptureReplayError('capture replay fixture missing: %s' % (path or '(empty)'))
    digest = fixture_sha256 or sha256_file(path)
    return CaptureReplayPair(render_head, replay_producer_head, path, digest)


def build_capture_replay_env(
    render_head: str,
    replay_producer_head: str,
    anchor_worktree: str,
    *,
    remote_base: str | None = None,
    require_remote: bool = False,
    fixture_path: str | None = None,
    fixture_sha256: str | None = None,
) -> dict[str, str]:
    """Dispatcher-facing env builder: explicit heads + fixture digest, no silent defaults."""
    render, producer = require_capture_heads(render_head, replay_producer_head)
    if not fixture_path:
        raise CaptureReplayError('capture replay requires fixture_path')
    pair = pair_from_fixture(render, producer, fixture_path, fixture_sha256)
    env = dict(os.environ)
    env.update(capture_replay_env_for_pair(pair, anchor_worktree))
    if require_remote:
        if not remote_base:
            raise CaptureReplayError('capture replay: remote_base required when require_remote')
        require_remote_build_matches(remote_base, pair.render_head)
    return env


def capture_subprocess_env(
    render_head: str,
    anchor_worktree: str,
    *,
    replay_producer_head: str,
    remote_base: str | None = None,
    require_remote: bool = False,
    fixture_path: str | None = None,
    fixture_sha256: str | None = None,
) -> dict[str, str]:
    return build_capture_replay_env(
        render_head,
        replay_producer_head,
        anchor_worktree,
        remote_base=remote_base,
        require_remote=require_remote,
        fixture_path=fixture_path,
        fixture_sha256=fixture_sha256,
    )
