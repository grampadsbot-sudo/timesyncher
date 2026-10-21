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
EVENT_VERSION_REGISTERED = 2
SUPPORTED_VERSIONS = frozenset({EVENT_VERSION, EVENT_VERSION_REGISTERED})
HEAD_RE = re.compile(r'^[0-9a-f]{40}$')
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')
STATES = frozenset({'pending', 'reviewed'})
REGISTRATION_S = 900
OBSERVATION_S = 900
RECEIPT_SCOPE = re.compile(
    r'^/home/ubishere9995/(?:tsv-work|gpt-[^/]+)/.+RECEIPT\.md$')
LEGACY_KEYS = frozenset({'at', 'message', 'receipt_exists'})
REQUIRED_KEYS_V1 = frozenset({
    'version', 'item', 'head', 'event_at', 'state', 'receipt_path', 'receipt_sha256',
    'gh_actor_id', 'comment_id', 'comment_body_sha256',
})
REQUIRED_KEYS_V2 = REQUIRED_KEYS_V1 | frozenset({'registered_at'})
ACCEPTANCE_KEYS_V1 = frozenset({
    'version', 'item', 'head', 'event_at', 'state', 'receipt_path', 'receipt_sha256',
    'gh_actor_id', 'draft_body_sha256',
})
ACCEPTANCE_KEYS_V2 = ACCEPTANCE_KEYS_V1 | frozenset({'registered_at'})
RESOLUTION_KEYS_V1 = frozenset({
    'version', 'item', 'head', 'event_at', 'state', 'receipt_path', 'receipt_sha256',
    'gh_actor_id', 'handback_comment_id', 'resolve_comment_id', 'resolve_comment_body_sha256',
})
RESOLUTION_KEYS_V2 = RESOLUTION_KEYS_V1 | frozenset({'registered_at'})


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


def _validate_common_fields(data, required_keys):
    _require(isinstance(data, dict), 'host handback event must be an object')
    _require(not is_legacy_record(data), 'legacy host handoff record unsupported')
    extra = set(data) - required_keys
    missing = required_keys - set(data)
    _require(not extra, 'host handback event has unknown fields')
    _require(not missing, 'host handback event missing required fields')
    version = data['version']
    _require(version in SUPPORTED_VERSIONS, 'unsupported host handback event version')
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
    if 'comment_id' in required_keys:
        comment_id = data['comment_id']
        _require(isinstance(comment_id, int) and comment_id > 0, 'comment_id invalid')
    if 'comment_body_sha256' in required_keys:
        body_sha = data['comment_body_sha256']
        _require(isinstance(body_sha, str) and SHA256_RE.fullmatch(body_sha),
                 'comment_body_sha256 invalid')
    if 'draft_body_sha256' in required_keys:
        draft_sha = data['draft_body_sha256']
        _require(isinstance(draft_sha, str) and SHA256_RE.fullmatch(draft_sha),
                 'draft_body_sha256 invalid')
    if 'handback_comment_id' in required_keys:
        handback_id = data['handback_comment_id']
        _require(isinstance(handback_id, int) and handback_id > 0, 'handback_comment_id invalid')
    if 'resolve_comment_id' in required_keys:
        resolve_id = data['resolve_comment_id']
        _require(isinstance(resolve_id, int) and resolve_id > 0, 'resolve_comment_id invalid')
    if 'resolve_comment_body_sha256' in required_keys:
        resolve_sha = data['resolve_comment_body_sha256']
        _require(isinstance(resolve_sha, str) and SHA256_RE.fullmatch(resolve_sha),
                 'resolve_comment_body_sha256 invalid')
    if version == EVENT_VERSION_REGISTERED:
        registered_at = data['registered_at']
        _require(isinstance(registered_at, (int, float)) and registered_at > 0,
                 'registered_at invalid')
    return dict(data)


def is_acceptance_record(data):
    if not isinstance(data, dict) or is_legacy_record(data):
        return False
    keys = set(data)
    if 'draft_body_sha256' in keys:
        _require('comment_id' not in keys and 'comment_body_sha256' not in keys,
                 'host handback event cannot mix handoff and acceptance fields')
        _require('handback_comment_id' not in keys and 'resolve_comment_id' not in keys,
                 'host handback event cannot mix acceptance and resolution fields')
        return True
    return False


def is_resolution_record(data):
    if not isinstance(data, dict) or is_legacy_record(data):
        return False
    keys = set(data)
    if 'handback_comment_id' in keys and 'resolve_comment_id' in keys:
        _require('comment_id' not in keys and 'comment_body_sha256' not in keys,
                 'host handback event cannot mix handoff and resolution fields')
        _require('draft_body_sha256' not in keys,
                 'host handback event cannot mix acceptance and resolution fields')
        return True
    return False


def normalize_record(data):
    if is_acceptance_record(data):
        version = data.get('version')
        if version == EVENT_VERSION_REGISTERED:
            return _validate_common_fields(data, ACCEPTANCE_KEYS_V2)
        return _validate_common_fields(data, ACCEPTANCE_KEYS_V1)
    if is_resolution_record(data):
        version = data.get('version')
        if version == EVENT_VERSION_REGISTERED:
            return _validate_common_fields(data, RESOLUTION_KEYS_V2)
        return _validate_common_fields(data, RESOLUTION_KEYS_V1)
    version = data.get('version') if isinstance(data, dict) else None
    if version == EVENT_VERSION_REGISTERED:
        return _validate_common_fields(data, REQUIRED_KEYS_V2)
    return _validate_common_fields(data, REQUIRED_KEYS_V1)


def _verify_registration_invariant(record, max_skew=60, max_gap=REGISTRATION_S):
    registered_at = record['registered_at']
    event_at = record['event_at']
    _require(registered_at >= event_at - max_skew,
             'host handback registration predates congruent host event')
    _require(registered_at - event_at <= max_gap,
             'host handback registration outside comment window')


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
    schema_version=EVENT_VERSION,
    registered_at=None,
):
    record = {
        'version': schema_version,
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
    if schema_version == EVENT_VERSION_REGISTERED:
        _require(registered_at is not None, 'registered_at required for version 2 events')
        record['registered_at'] = registered_at
    return normalize_record(record)


def build_acceptance_record(
    *,
    item,
    head,
    event_at,
    state,
    receipt_path,
    receipt_sha256,
    gh_actor_id,
    draft_body_sha256,
    schema_version=EVENT_VERSION,
    registered_at=None,
):
    record = {
        'version': schema_version,
        'item': item,
        'head': head,
        'event_at': event_at,
        'state': state,
        'receipt_path': str(receipt_path),
        'receipt_sha256': receipt_sha256,
        'gh_actor_id': gh_actor_id,
        'draft_body_sha256': draft_body_sha256,
    }
    if schema_version == EVENT_VERSION_REGISTERED:
        _require(registered_at is not None, 'registered_at required for version 2 events')
        record['registered_at'] = registered_at
    return normalize_record(record)


def verify_receipt_binding(record):
    record = normalize_record(record)
    data = read_receipt_bytes(record['receipt_path'])
    digest = sha256_hex(data)
    _require(digest == record['receipt_sha256'], 'receipt bytes do not match recorded sha256')
    return data


def _comment_created_at(comment):
    _require(isinstance(comment, dict), 'comment must be an object')
    created = comment.get('created_at')
    _require(isinstance(created, str) and created, 'comment created_at required')
    from datetime import datetime
    try:
        stamp = datetime.fromisoformat(created.replace('Z', '+00:00'))
    except ValueError as exc:
        raise EventError('comment created_at is not exact UTC') from exc
    _require(stamp.tzinfo is not None, 'comment created_at is not exact UTC')
    return stamp.timestamp()


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


def _verify_live_bindings(record, comment, current_head, now, max_skew):
    _require(record['head'] == current_head, 'event head does not match current head')
    _require(record['event_at'] <= now + max_skew, 'host handback event timestamp is in the future')
    comment_at = _comment_created_at(comment)
    _require(abs(record['event_at'] - comment_at) <= max_skew,
             'event_at and comment created_at disagree beyond clock skew')
    verify_receipt_binding(record)
    verify_comment_binding(record, comment)


def verify_event(record, comment, current_head, now=None, max_skew=60, max_age=900):
    """Revalidate a version-1 stored event against live receipt bytes and GH comment."""
    record = normalize_record(record)
    _require(record['version'] == EVENT_VERSION,
             'version 2 host handback events require verify_observation')
    now = now if now is not None else time.time()
    _require(0 < max_age <= REGISTRATION_S, 'event freshness window must be between zero and 900 seconds')
    _require(now - record['event_at'] <= max_age, 'host handback event is stale')
    _verify_live_bindings(record, comment, current_head, now, max_skew)
    return record


def verify_observation(record, comment, current_head, observed_at, now=None, max_skew=60,
                       max_observation_age=OBSERVATION_S):
    """Revalidate a version-2 event with a fresh collector observation.

    ``event_at`` remains the review-age clock and is not rewritten. Observation
    freshness is enforced on ``observed_at`` (when the collector held the snapshot).
    """
    record = normalize_record(record)
    _require(record['version'] == EVENT_VERSION_REGISTERED,
             'verify_observation requires version 2 host handback events')
    now = now if now is not None else time.time()
    _require(0 < max_observation_age <= OBSERVATION_S,
             'observation freshness window must be between zero and 900 seconds')
    _require(observed_at <= now + max_skew, 'host handback observation timestamp is in the future')
    _require(now - observed_at <= max_observation_age, 'host handback observation is stale')
    _require(record['registered_at'] <= now + max_skew, 'host handback registration timestamp is in the future')
    _verify_registration_invariant(record, max_skew=max_skew)
    _verify_live_bindings(record, comment, current_head, now, max_skew)
    return record


def verify_acceptance_binding(record, item):
    record = normalize_record(record)
    _require(is_acceptance_record(record), 'not an acceptance event record')
    _require(isinstance(item, dict), 'item must be an object')
    _require(item.get('number') == record['item'], 'acceptance event item mismatch')
    body = item.get('body')
    _require(isinstance(body, str), 'draft body missing')
    _require(digest_comment_body(body) == record['draft_body_sha256'],
             'draft body does not match recorded digest')
    user = item.get('user') or {}
    _require(user.get('id') == record['gh_actor_id'], 'host GH actor id mismatch')
    return body


def _verify_acceptance_live_bindings(record, item, current_head, now, max_skew):
    _require(record['head'] == current_head, 'event head does not match current head')
    _require(record['event_at'] <= now + max_skew, 'host handback event timestamp is in the future')
    verify_receipt_binding(record)
    verify_acceptance_binding(record, item)


def verify_acceptance_event(record, item, current_head, now=None, max_skew=60, max_age=900):
    """Revalidate a version-1 acceptance record against live draft body and receipt bytes."""
    record = normalize_record(record)
    _require(is_acceptance_record(record), 'verify_acceptance_event requires an acceptance record')
    _require(record['version'] == EVENT_VERSION,
             'version 2 acceptance events require verify_acceptance_observation')
    now = now if now is not None else time.time()
    _require(0 < max_age <= REGISTRATION_S, 'event freshness window must be between zero and 900 seconds')
    _require(now - record['event_at'] <= max_age, 'host handback event is stale')
    _verify_acceptance_live_bindings(record, item, current_head, now, max_skew)
    return record


def verify_acceptance_observation(record, item, current_head, observed_at, now=None, max_skew=60,
                                  max_observation_age=OBSERVATION_S):
    """Revalidate a version-2 acceptance record with a fresh collector observation."""
    record = normalize_record(record)
    _require(is_acceptance_record(record), 'verify_acceptance_observation requires an acceptance record')
    _require(record['version'] == EVENT_VERSION_REGISTERED,
             'verify_acceptance_observation requires version 2 acceptance events')
    now = now if now is not None else time.time()
    _require(0 < max_observation_age <= OBSERVATION_S,
             'observation freshness window must be between zero and 900 seconds')
    _require(observed_at <= now + max_skew, 'host handback observation timestamp is in the future')
    _require(now - observed_at <= max_observation_age, 'host handback observation is stale')
    _require(record['registered_at'] <= now + max_skew, 'host handback registration timestamp is in the future')
    _verify_registration_invariant(record, max_skew=max_skew)
    _verify_acceptance_live_bindings(record, item, current_head, now, max_skew)
    return record


def build_resolution_record(
    *,
    item,
    head,
    event_at,
    state,
    receipt_path,
    receipt_sha256,
    gh_actor_id,
    handback_comment_id,
    resolve_comment_id,
    resolve_comment_body_sha256,
    schema_version=EVENT_VERSION,
    registered_at=None,
):
    record = {
        'version': schema_version,
        'item': item,
        'head': head,
        'event_at': event_at,
        'state': state,
        'receipt_path': str(receipt_path),
        'receipt_sha256': receipt_sha256,
        'gh_actor_id': gh_actor_id,
        'handback_comment_id': handback_comment_id,
        'resolve_comment_id': resolve_comment_id,
        'resolve_comment_body_sha256': resolve_comment_body_sha256,
    }
    if schema_version == EVENT_VERSION_REGISTERED:
        _require(registered_at is not None, 'registered_at required for version 2 events')
        record['registered_at'] = registered_at
    return normalize_record(record)


def verify_resolve_comment_binding(record, comment):
    record = normalize_record(record)
    _require(is_resolution_record(record), 'not a resolution event record')
    _require(isinstance(comment, dict), 'comment must be an object')
    _require(comment.get('id') == record['resolve_comment_id'], 'resolve comment id mismatch')
    expected_url = 'https://api.github.com/repos/grampadsbot-sudo/timesyncher/issues/%d' % record['item']
    _require(comment.get('issue_url') == expected_url, 'resolve comment issue does not match event item')
    user = comment.get('user') or {}
    _require(user.get('id') == record['gh_actor_id'], 'host GH actor id mismatch')
    body = comment.get('body')
    _require(isinstance(body, str), 'resolve comment body missing')
    _require(digest_comment_body(body) == record['resolve_comment_body_sha256'],
             'resolve comment body does not match recorded digest')
    created = comment.get('created_at')
    updated = comment.get('updated_at')
    _require(created and updated, 'comment timestamps required')
    _require(created == updated, 'edited host comment cannot authenticate resolution')
    return body


def _verify_resolution_live_bindings(record, comment, handback_comment_id, current_head, now, max_skew):
    _require(record['head'] == current_head, 'event head does not match current head')
    _require(record['event_at'] <= now + max_skew, 'host handback event timestamp is in the future')
    _require(record['handback_comment_id'] == handback_comment_id,
             'resolution handback comment id mismatch')
    comment_at = _comment_created_at(comment)
    _require(record['event_at'] >= comment_at - max_skew,
             'resolution event predates resolve comment')
    verify_receipt_binding(record)
    verify_resolve_comment_binding(record, comment)


def verify_resolution_event(record, comment, handback_comment_id, current_head, now=None, max_skew=60,
                            max_age=900):
    record = normalize_record(record)
    _require(is_resolution_record(record), 'verify_resolution_event requires a resolution record')
    _require(record['version'] == EVENT_VERSION,
             'version 2 resolution events require verify_resolution_observation')
    now = now if now is not None else time.time()
    _require(0 < max_age <= REGISTRATION_S, 'event freshness window must be between zero and 900 seconds')
    _require(now - record['event_at'] <= max_age, 'host handback event is stale')
    _verify_resolution_live_bindings(record, comment, handback_comment_id, current_head, now, max_skew)
    return record


def verify_resolution_observation(record, comment, handback_comment_id, current_head, observed_at,
                                  now=None, max_skew=60, max_observation_age=OBSERVATION_S):
    """Revalidate a version-2 resolution record with a fresh collector observation."""
    record = normalize_record(record)
    _require(is_resolution_record(record), 'verify_resolution_observation requires a resolution record')
    _require(record['version'] == EVENT_VERSION_REGISTERED,
             'verify_resolution_observation requires version 2 resolution events')
    _require(record['state'] == 'pending',
             'unsupported reviewed host handback resolution; explicit acceptance contract required')
    now = now if now is not None else time.time()
    _require(0 < max_observation_age <= OBSERVATION_S,
             'observation freshness window must be between zero and 900 seconds')
    _require(observed_at <= now + max_skew, 'host handback observation timestamp is in the future')
    _require(now - observed_at <= max_observation_age, 'host handback observation is stale')
    _require(record['registered_at'] <= now + max_skew, 'host handback registration timestamp is in the future')
    _verify_registration_invariant(record, max_skew=max_skew)
    _verify_resolution_live_bindings(record, comment, handback_comment_id, current_head, now, max_skew)
    return record


def produce_resolution_event(
    path,
    *,
    item,
    head,
    event_at,
    state,
    receipt_path,
    receipt_sha256,
    gh_actor_id,
    handback_comment_id,
    resolve_comment_id,
    resolve_comment_body,
    now=None,
    schema_version=EVENT_VERSION,
    registered_at=None,
):
    """Write a new host-recorded handback resolution event. Refuses existing files."""
    now = now if now is not None else time.time()
    _require(schema_version in SUPPORTED_VERSIONS, 'unsupported host handback event version')
    body_sha = digest_comment_body(resolve_comment_body)
    if schema_version == EVENT_VERSION_REGISTERED:
        registered_at = registered_at if registered_at is not None else now
        _require(registered_at <= now + 60, 'registered_at cannot be in the future')
        _require(event_at <= registered_at + 60, 'event_at cannot follow registration')
        _require(registered_at - event_at <= REGISTRATION_S,
                 'host handback registration outside comment window')
        _require(now - event_at <= REGISTRATION_S,
                 'refusing historical host handback registration')
    record = build_resolution_record(
        item=item,
        head=head,
        event_at=event_at,
        state=state,
        receipt_path=receipt_path,
        receipt_sha256=receipt_sha256,
        gh_actor_id=gh_actor_id,
        handback_comment_id=handback_comment_id,
        resolve_comment_id=resolve_comment_id,
        resolve_comment_body_sha256=body_sha,
        schema_version=schema_version,
        registered_at=registered_at,
    )
    _require(record['event_at'] <= now + 60, 'event_at cannot be in the future')
    data = read_receipt_bytes(receipt_path)
    _require(sha256_hex(data) == receipt_sha256, 'supplied receipt_sha256 does not match file bytes')
    out = Path(path)
    _require(not out.exists(), 'refusing to overwrite an existing host handback event file')
    atomic_write_json(out, record)
    return record


def produce_acceptance_event(
    path,
    *,
    item,
    head,
    event_at,
    state,
    receipt_path,
    receipt_sha256,
    gh_actor_id,
    draft_body,
    now=None,
    schema_version=EVENT_VERSION,
    registered_at=None,
):
    """Write a new host-recorded pending-acceptance event. Refuses existing files."""
    now = now if now is not None else time.time()
    _require(schema_version in SUPPORTED_VERSIONS, 'unsupported host handback event version')
    body_sha = digest_comment_body(draft_body)
    if schema_version == EVENT_VERSION_REGISTERED:
        registered_at = registered_at if registered_at is not None else now
        _require(registered_at <= now + 60, 'registered_at cannot be in the future')
        _require(event_at <= registered_at + 60, 'event_at cannot follow registration')
        _require(registered_at - event_at <= REGISTRATION_S,
                 'host handback registration outside comment window')
        _require(now - event_at <= REGISTRATION_S,
                 'refusing historical host handback registration')
    record = build_acceptance_record(
        item=item,
        head=head,
        event_at=event_at,
        state=state,
        receipt_path=receipt_path,
        receipt_sha256=receipt_sha256,
        gh_actor_id=gh_actor_id,
        draft_body_sha256=body_sha,
        schema_version=schema_version,
        registered_at=registered_at,
    )
    _require(record['event_at'] <= now + 60, 'event_at cannot be in the future')
    data = read_receipt_bytes(receipt_path)
    _require(sha256_hex(data) == receipt_sha256, 'supplied receipt_sha256 does not match file bytes')
    out = Path(path)
    _require(not out.exists(), 'refusing to overwrite an existing host handback event file')
    atomic_write_json(out, record)
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
    schema_version=EVENT_VERSION,
    registered_at=None,
):
    """Write a new host-recorded event after binding checks. Refuses existing files."""
    now = now if now is not None else time.time()
    _require(schema_version in SUPPORTED_VERSIONS, 'unsupported host handback event version')
    body_sha = digest_comment_body(comment_body)
    if schema_version == EVENT_VERSION_REGISTERED:
        registered_at = registered_at if registered_at is not None else now
        _require(registered_at <= now + 60, 'registered_at cannot be in the future')
        _require(event_at <= registered_at + 60, 'event_at cannot follow registration')
        _require(registered_at - event_at <= REGISTRATION_S,
                 'host handback registration outside comment window')
        _require(now - event_at <= REGISTRATION_S,
                 'refusing historical host handback registration')
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
        schema_version=schema_version,
        registered_at=registered_at,
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
