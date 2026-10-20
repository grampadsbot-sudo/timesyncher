"""Host-recorded handback events: explicit producer/reader, no runtime hook.

New events bind an item, exact current head, scoped receipt bytes, and a GitHub
comment identity (actor id, comment id, body digest). Legacy HOST_HANDOFF shapes
(at/message/receipt_exists only) are refused; nothing is backfilled.

Authority: bot-admin/lanes/vk-pr-handoff/pr-569 (host handback event producer).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import time
from pathlib import Path

EVENT_VERSION = 1
HEAD_RE = re.compile(r'^[0-9a-f]{40}$')
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')
STATES = frozenset({'pending', 'reviewed'})
RECEIPT_SCOPE = re.compile(
    r'^/home/ubishere9995/(?:tsv-work|gpt-[^/]+)/.+RECEIPT\.md$')
LEGACY_KEYS = frozenset({'at', 'message', 'receipt_exists'})
REQUIRED_KEYS = frozenset({
    'version', 'item', 'head', 'event_at', 'state', 'receipt_path', 'receipt_sha256',
    'gh_actor_id', 'comment_id', 'comment_body_sha256',
})


class EventError(ValueError):
    pass


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest_comment_body(body: str) -> str:
    if not isinstance(body, str):
        raise EventError('comment body must be a string')
    return sha256_hex(body.encode())


def _require(condition, reason):
    if not condition:
        raise EventError(reason)


def is_legacy_record(data):
    if not isinstance(data, dict):
        return False
    keys = set(data)
    if keys <= LEGACY_KEYS:
        return True
    if 'version' not in data and LEGACY_KEYS & keys:
        return True
    return False


def validate_scoped_receipt_path(path):
    _require(isinstance(path, (str, Path)), 'receipt path must be a string')
    raw = Path(path)
    _require(raw.is_absolute(), 'receipt path must be absolute')
    text = str(raw)
    _require(RECEIPT_SCOPE.fullmatch(text), 'receipt path outside scoped host worktree')
    resolved = raw.resolve(strict=True)
    _require(resolved == raw, 'receipt path cannot traverse symlinks')
    return resolved


def read_receipt_bytes(path):
    resolved = validate_scoped_receipt_path(path)
    try:
        return resolved.read_bytes()
    except OSError as exc:
        raise EventError('receipt file unreadable') from exc


def normalize_record(data):
    _require(isinstance(data, dict), 'host handback event must be an object')
    _require(not is_legacy_record(data), 'legacy host handoff record unsupported')
    extra = set(data) - REQUIRED_KEYS
    missing = REQUIRED_KEYS - set(data)
    _require(not extra, 'host handback event has unknown fields')
    _require(not missing, 'host handback event missing required fields')
    _require(data['version'] == EVENT_VERSION, 'unsupported host handback event version')
    item = data['item']
    _require(isinstance(item, int) and item > 0, 'item must be a positive integer')
    head = data['head']
    _require(isinstance(head, str) and HEAD_RE.fullmatch(head), 'head must be a full git SHA')
    event_at = data['event_at']
    _require(isinstance(event_at, (int, float)) and event_at > 0, 'event_at invalid')
    state = data['state']
    _require(state in STATES, 'state must be pending or reviewed')
    receipt_path = data['receipt_path']
    _require(isinstance(receipt_path, str), 'receipt_path must be a string')
    receipt_sha = data['receipt_sha256']
    _require(isinstance(receipt_sha, str) and SHA256_RE.fullmatch(receipt_sha),
             'receipt_sha256 invalid')
    actor = data['gh_actor_id']
    _require(isinstance(actor, int) and actor > 0, 'gh_actor_id invalid')
    comment_id = data['comment_id']
    _require(isinstance(comment_id, int) and comment_id > 0, 'comment_id invalid')
    body_sha = data['comment_body_sha256']
    _require(isinstance(body_sha, str) and SHA256_RE.fullmatch(body_sha),
             'comment_body_sha256 invalid')
    return dict(data)


def build_record(
    *,
    item,
    head,
    event_at,
    state,
    receipt_path,
    receipt_sha256,
    gh_actor_id,
    comment_id,
    comment_body_sha256,
):
    record = {
        'version': EVENT_VERSION,
        'item': item,
        'head': head,
        'event_at': event_at,
        'state': state,
        'receipt_path': str(receipt_path),
        'receipt_sha256': receipt_sha256,
        'gh_actor_id': gh_actor_id,
        'comment_id': comment_id,
        'comment_body_sha256': comment_body_sha256,
    }
    return normalize_record(record)


def verify_receipt_binding(record):
    record = normalize_record(record)
    data = read_receipt_bytes(record['receipt_path'])
    digest = sha256_hex(data)
    _require(digest == record['receipt_sha256'], 'receipt bytes do not match recorded sha256')
    return data


def verify_comment_binding(record, comment):
    record = normalize_record(record)
    _require(isinstance(comment, dict), 'comment must be an object')
    _require(comment.get('id') == record['comment_id'], 'comment id mismatch')
    expected_url = 'https://api.github.com/repos/grampadsbot-sudo/timesyncher/issues/%d' % record['item']
    _require(comment.get('issue_url') == expected_url, 'comment issue does not match event item')
    user = comment.get('user') or {}
    _require(user.get('id') == record['gh_actor_id'], 'host GH actor id mismatch')
    body = comment.get('body')
    _require(isinstance(body, str), 'comment body missing')
    _require(digest_comment_body(body) == record['comment_body_sha256'],
             'comment body does not match recorded digest')
    created = comment.get('created_at')
    updated = comment.get('updated_at')
    _require(created and updated, 'comment timestamps required')
    _require(created == updated, 'edited host comment cannot authenticate event')
    return body


def verify_event(record, comment, current_head, now=None, max_skew=60, max_age=900):
    """Revalidate a stored event against live receipt bytes and GH comment."""
    record = normalize_record(record)
    now = now if now is not None else time.time()
    _require(record['head'] == current_head, 'event head does not match current head')
    _require(record['event_at'] <= now + max_skew, 'host handback event timestamp is in the future')
    _require(0 < max_age <= 900, 'event freshness window must be between zero and 900 seconds')
    _require(now - record['event_at'] <= max_age, 'host handback event is stale')
    verify_receipt_binding(record)
    verify_comment_binding(record, comment)
    return record


def produce_event(
    path,
    *,
    item,
    head,
    event_at,
    state,
    receipt_path,
    receipt_sha256,
    gh_actor_id,
    comment_id,
    comment_body,
    now=None,
):
    """Write a new host-recorded event after binding checks. Refuses existing files."""
    now = now if now is not None else time.time()
    body_sha = digest_comment_body(comment_body)
    record = build_record(
        item=item,
        head=head,
        event_at=event_at,
        state=state,
        receipt_path=receipt_path,
        receipt_sha256=receipt_sha256,
        gh_actor_id=gh_actor_id,
        comment_id=comment_id,
        comment_body_sha256=body_sha,
    )
    _require(record['event_at'] <= now + 60, 'event_at cannot be in the future')
    data = read_receipt_bytes(receipt_path)
    _require(sha256_hex(data) == receipt_sha256, 'supplied receipt_sha256 does not match file bytes')
    out = Path(path)
    _require(not out.exists(), 'refusing to overwrite an existing host handback event file')
    atomic_write_json(out, record)
    return record


def load_event(path):
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise EventError('host handback event file unreadable') from exc
    return normalize_record(data)


def atomic_write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.host-handback-', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w') as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write('\n')
        os.link(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
