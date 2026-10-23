"""Canonical launch-time proof for automatic vkfill issue jobs (consumer + contract)."""
import hashlib
import json
import re
from pathlib import Path

from host_handback_review import EvidenceError


def require(condition, reason):
    if not condition:
        raise EvidenceError(reason)

LAUNCH_IDENTITY_FILE = 'launch-identity.json'
LAUNCH_IDENTITY_VERSION = 1
ISSUE_FINGERPRINT_RE = re.compile(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ')
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')
HEAD_RE = re.compile(r'\b[0-9a-f]{40}\b')


def issue_body_sha256(body):
    return hashlib.sha256((body if body is not None else '').encode('utf-8')).hexdigest()


def issue_configured_base(item, default_base):
    labels = sorted(x['name'][5:] for x in item.get('labels', [])
                    if x.get('name', '').startswith('base:'))
    require(len(labels) <= 1, 'automatic issue base labels ambiguous')
    if len(labels) == 1:
        return labels[0]
    body_base = re.search(r'(?im)^\W*base(?:\s+branch)?\W*[:=]\s*`?([\w./-]+)`?',
                          item.get('body') or '')
    return body_base.group(1) if body_base else default_base


def load_launch_identity(job_path):
    path = Path(job_path) / LAUNCH_IDENTITY_FILE
    require(path.is_file(), 'automatic issue launch identity proof missing')
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise EvidenceError('automatic issue launch identity proof unreadable') from exc
    require(isinstance(data, dict), 'automatic issue launch identity proof invalid')
    return data


def validate_launch_identity_record(data, number, fingerprint, start_sha, default_base):
    require(data.get('version') == LAUNCH_IDENTITY_VERSION,
            'automatic issue launch identity proof version unsupported')
    require(data.get('kind') == 'issue', 'automatic issue launch identity proof kind invalid')
    require(data.get('number') == number,
            'automatic issue launch identity proof item mismatch')
    stamp = data.get('issue_updated_at')
    require(isinstance(stamp, str) and ISSUE_FINGERPRINT_RE.fullmatch(stamp),
            'automatic issue launch identity proof timestamp invalid')
    require(stamp == fingerprint,
            'automatic issue launch identity proof disagrees with job fingerprint')
    recorded_start = data.get('start_sha')
    require(isinstance(recorded_start, str) and HEAD_RE.fullmatch(recorded_start),
            'automatic issue launch identity proof start_sha invalid')
    require(recorded_start == start_sha,
            'automatic issue launch identity proof start_sha mismatch')
    base = data.get('base')
    require(isinstance(base, str) and base, 'automatic issue launch identity proof base invalid')
    body_sha = data.get('body_sha256')
    require(isinstance(body_sha, str) and SHA256_RE.fullmatch(body_sha),
            'automatic issue launch identity proof body_sha256 invalid')
    extra = set(data) - {'version', 'kind', 'number', 'issue_updated_at', 'start_sha', 'base', 'body_sha256'}
    require(not extra, 'automatic issue launch identity proof has unknown fields')
    return stamp, base, body_sha


def authenticate_issue_launch_identity(job_path, number, fingerprint, start_sha, item, default_base):
    require(isinstance(fingerprint, str) and ISSUE_FINGERPRINT_RE.fullmatch(fingerprint),
            'automatic issue fingerprint timestamp invalid')
    data = load_launch_identity(job_path)
    _, launch_base, launch_body_sha = validate_launch_identity_record(
        data, number, fingerprint, start_sha, default_base)
    live_base = issue_configured_base(item, default_base)
    require(live_base == launch_base,
            'automatic issue base disagrees with authenticated launch identity')
    live_body_sha = issue_body_sha256(item.get('body'))
    require(live_body_sha == launch_body_sha,
            'automatic issue body disagrees with authenticated launch identity')
    live_updated = item.get('updated_at')
    require(isinstance(live_updated, str) and ISSUE_FINGERPRINT_RE.fullmatch(live_updated),
            'authenticated issue updated_at invalid')
    return launch_base
