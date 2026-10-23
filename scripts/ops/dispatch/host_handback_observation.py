"""Zero-model host observation for stale canonical assessment headers.

Outer host writes a scoped JSON artifact after independently verifying live GBrain
assessment/receipt bytes, GitHub heads, and lane registry scope. The collector
accepts a stale Current-pass header only when a fresh observation binds the same
assessment content, section event time, receipt digests, and per-item owners/heads.
Management action timestamps and host event clocks are never rewritten.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

from host_handback_events import HEAD_RE, SHA256_RE, sha256_hex

OBSERVATION_VERSION = 1
OBSERVATION_S = 900
REGISTRATION_S = 900
ASSESSMENT_SLUG = 'bot-admin/lanes/vk-running-assessment'
RUNTIME_SCOPE = re.compile(r'^/home/ubishere9995/(?:tsv-dispatch|tsv-work|gpt-[^/]+)(?:/.*)?$')
OBSERVATION_PATH_SCOPE = re.compile(
    r'^/home/ubishere9995/(?:tsv-work|gpt-[^/]+)/.+\.json$')
REQUIRED_KEYS = frozenset({
    'version', 'observed_at', 'registered_at', 'assessment_slug', 'assessment_sha256',
    'section_event_at', 'receipt_slugs', 'receipt_sha256', 'items', 'runtime_root',
})


class ObservationError(ValueError):
    pass


def _require(condition, reason):
    if not condition:
        raise ObservationError(reason)


def load_observation(path):
    config_path = Path(path)
    _require(config_path.is_file(), 'host observation file not found')
    try:
        data = json.loads(config_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ObservationError('host observation unreadable') from exc
    return data


def validate_observation_path(path, must_exist=True):
    _require(isinstance(path, str) and path, 'host observation path must be a non-empty string')
    _require(OBSERVATION_PATH_SCOPE.fullmatch(path), 'host observation path outside scoped host worktree')
    raw = Path(path)
    if must_exist:
        resolved = raw.resolve(strict=True)
    else:
        raw.parent.mkdir(parents=True, exist_ok=True)
        resolved = raw.resolve()
    _require(str(resolved) == str(raw.absolute()), 'host observation path cannot traverse symlinks')
    return str(resolved) if not must_exist else path


def _parse_section_event_at(header_line):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    PT = ZoneInfo('America/Los_Angeles')
    utc = re.search(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) UTC', header_line)
    pt = re.search(r'(\d{4}-\d\d-\d\d) (\d\d:\d\d) PT', header_line)
    _require(utc or pt, 'assessment current section has no unambiguous event time')
    if utc:
        from host_handback_review import _time
        return _time(utc.group(1).replace(' ', 'T') + 'Z')
    return datetime.strptime(pt.group(1) + ' ' + pt.group(2), '%Y-%m-%d %H:%M').replace(tzinfo=PT).timestamp()


def locate_current_section(text):
    """Return (section_text, section_event_at) without freshness checks."""
    sections = re.split(r'(?m)^(?=## )', text)
    for section in sections:
        header = section.splitlines()[0] if section else ''
        if not re.search(r'^## (?:Current (?:manager )?pass|Managing-dr pass)\b', header, re.I):
            continue
        return section, _parse_section_event_at(header)
    raise ObservationError('current canonical assessment section not found')


def _validate_record_shape(record):
    _require(isinstance(record, dict), 'host observation must be an object')
    extra = set(record) - REQUIRED_KEYS - frozenset({'attestation_sha256'})
    missing = REQUIRED_KEYS - set(record)
    _require(not extra, 'host observation has unknown fields')
    _require(not missing, 'host observation missing required fields')
    _require(record['version'] == OBSERVATION_VERSION, 'unsupported host observation version')
    observed_at = record['observed_at']
    registered_at = record['registered_at']
    _require(isinstance(observed_at, (int, float)) and observed_at > 0, 'observed_at invalid')
    _require(isinstance(registered_at, (int, float)) and registered_at > 0, 'registered_at invalid')
    _require(0 <= registered_at - observed_at <= REGISTRATION_S,
             'host observation registration too late after observation')
    slug = record['assessment_slug']
    _require(slug == ASSESSMENT_SLUG, 'host observation assessment slug mismatch')
    digest = record['assessment_sha256']
    _require(isinstance(digest, str) and SHA256_RE.fullmatch(digest), 'assessment_sha256 invalid')
    section_at = record['section_event_at']
    _require(isinstance(section_at, (int, float)) and section_at > 0, 'section_event_at invalid')
    slugs = record['receipt_slugs']
    _require(isinstance(slugs, list) and slugs == sorted(set(slugs)), 'receipt_slugs must be a sorted unique list')
    receipts = record['receipt_sha256']
    _require(isinstance(receipts, dict), 'receipt_sha256 must be an object')
    _require(set(receipts) == set(slugs), 'receipt_sha256 keys must match receipt_slugs')
    for slug, value in receipts.items():
        _require(isinstance(value, str) and SHA256_RE.fullmatch(value), 'receipt_sha256 digest invalid')
    items = record['items']
    _require(isinstance(items, dict) and items, 'items must be a non-empty object')
    for key, row in items.items():
        try:
            number = int(key)
        except (TypeError, ValueError):
            raise ObservationError('items keys must be item numbers') from None
        _require(number > 0, 'items item must be positive')
        _require(isinstance(row, dict), 'item observation must be an object')
        extra_item = set(row) - {'owner', 'head'}
        _require(not extra_item, 'item observation has unknown fields')
        _require({'owner', 'head'} <= set(row), 'item observation missing owner or head')
        owner = row['owner']
        _require(isinstance(owner, str) and owner.strip()
                and owner.lower() not in {'unknown', 'not found', 'n/a', '-', '—', '?'},
                'item observation owner invalid')
        head = row['head']
        _require(isinstance(head, str) and HEAD_RE.fullmatch(head), 'item observation head invalid')
    root = record['runtime_root']
    _require(isinstance(root, str) and RUNTIME_SCOPE.match(root), 'runtime_root outside scoped host tree')
    attestation = record.get('attestation_sha256')
    if attestation is not None:
        _require(isinstance(attestation, str) and SHA256_RE.fullmatch(attestation),
                 'attestation_sha256 invalid')


def verify_observation_freshness(record, now=None, max_skew=60, max_age=OBSERVATION_S):
    now = time.time() if now is None else now
    _require(0 < max_age <= OBSERVATION_S,
             'observation freshness window must be between zero and 900 seconds')
    observed_at = record['observed_at']
    _require(observed_at <= now + max_skew, 'host observation timestamp is in the future')
    _require(now - observed_at <= max_age, 'host observation is stale')


def verify_assessment_observation(record, assessment_text, receipt_pages, now=None, max_skew=60,
                                    max_age=OBSERVATION_S):
    """Bind observation to assessment bytes and receipt pages (collector init)."""
    _validate_record_shape(record)
    verify_observation_freshness(record, now=now, max_skew=max_skew, max_age=max_age)
    digest = sha256_hex(assessment_text.encode())
    _require(record['assessment_sha256'] == digest, 'host observation assessment digest mismatch')
    section, section_at = locate_current_section(assessment_text)
    _require(abs(record['section_event_at'] - section_at) < 0.001,
             'host observation section event time mismatch')
    slugs = sorted(set(re.findall(r'\[\[(bot-admin/receipts/[^\]\s]+)\]\]', section)))
    _require(record['receipt_slugs'] == slugs, 'host observation receipt scope incomplete')
    for slug in slugs:
        page = receipt_pages.get(slug)
        _require(isinstance(page, str), 'host observation receipt page missing for ' + slug)
        _require(record['receipt_sha256'][slug] == sha256_hex(page.encode()),
                 'host observation receipt digest mismatch for ' + slug)
    return section


def verify_item_observation(record, number, owner, head, now=None):
    """Per-item owner/head binding during collection."""
    _validate_record_shape(record)
    verify_observation_freshness(record, now=now)
    key = str(number)
    _require(key in record['items'], 'host observation missing item #%d' % number)
    row = record['items'][key]
    _require(row['owner'] == owner, 'host observation owner mismatch #%d' % number)
    _require(head and HEAD_RE.fullmatch(head), 'invalid current head SHA')
    _require(row['head'] == head, 'host observation head mismatch #%d' % number)


def produce_observation(path, assessment_text, receipt_pages, items, runtime_root, observed_at=None,
                        registered_at=None, attestation_sha256=None, clock=time.time):
    """Outer-host producer. Does not mutate assessment or event clocks."""
    path = validate_observation_path(path, must_exist=False)
    observed_at = clock() if observed_at is None else observed_at
    registered_at = clock() if registered_at is None else registered_at
    _require(registered_at >= observed_at, 'registered_at precedes observed_at')
    _require(registered_at - observed_at <= REGISTRATION_S,
             'host observation registration too late after observation')
    section, section_at = locate_current_section(assessment_text)
    slugs = sorted(set(re.findall(r'\[\[(bot-admin/receipts/[^\]\s]+)\]\]', section)))
    receipts = {}
    for slug in slugs:
        page = receipt_pages.get(slug)
        _require(isinstance(page, str), 'receipt page missing for ' + slug)
        receipts[slug] = sha256_hex(page.encode())
    item_rows = {}
    for number, owner, head in items:
        _require(isinstance(number, int) and number > 0, 'item number invalid')
        _require(head and HEAD_RE.fullmatch(head), 'item head invalid')
        item_rows[str(number)] = {'owner': owner, 'head': head}
    record = {
        'version': OBSERVATION_VERSION,
        'observed_at': observed_at,
        'registered_at': registered_at,
        'assessment_slug': ASSESSMENT_SLUG,
        'assessment_sha256': sha256_hex(assessment_text.encode()),
        'section_event_at': section_at,
        'receipt_slugs': slugs,
        'receipt_sha256': receipts,
        'items': item_rows,
        'runtime_root': str(Path(runtime_root).resolve()),
    }
    if attestation_sha256 is not None:
        _require(SHA256_RE.fullmatch(attestation_sha256), 'attestation_sha256 invalid')
        record['attestation_sha256'] = attestation_sha256
    import os
    temp = Path(path).with_name(Path(path).name + '.tmp-%d' % os.getpid())
    try:
        temp.write_text(json.dumps(record, indent=2, sort_keys=True) + '\n')
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)
    return record


def produce_live_observation(path, gh, repo, readers, clock=time.time):
    from host_handback_evidence import SOURCE_RE, ownership, last_action
    started = clock()
    actor = gh.req('GET', '/user')
    _require(actor.get('id') and actor.get('login'), 'authenticated host actor required')
    assessment = readers.page(ASSESSMENT_SLUG)
    section, _ = locate_current_section(assessment)
    receipts = {slug: readers.page(slug) for slug in sorted(set(SOURCE_RE.findall(section)))}
    _require(receipts, 'canonical receipt scope required')
    route = '/repos/%s/pulls?state=open&per_page=100' % repo
    pulls = list(gh.pages(route))
    heads = {row['number']: row['head']['sha'] for row in pulls}
    _require(heads and len(heads) == len(pulls), 'complete unique PR scope required')
    rows = []
    for number, head in sorted(heads.items()):
        owner = ownership(section, number)
        last_action(assessment, number, clock())
        live = gh.req('GET', '/repos/%s/pulls/%d' % (repo, number))
        _require(live.get('state') == 'open' and live.get('head', {}).get('sha') == head,
                 'PR changed during host observation #%d' % number)
        rows.append((number, owner, head))
    running = readers.running(set(heads), heads)
    _require(isinstance(running, frozenset), 'authenticated live job evidence required')
    again = list(gh.pages(route))
    _require({row['number']: row['head']['sha'] for row in again} == heads,
             'PR scope changed during host observation')
    _require(readers.page(ASSESSMENT_SLUG) == assessment, 'assessment changed during host observation')
    for slug, page in receipts.items():
        _require(readers.page(slug) == page, 'receipt changed during host observation')
    _require(0 <= clock() - started <= 60, 'live host observation exceeded 60 seconds')
    return produce_observation(path, assessment, receipts, rows, str(readers.root),
                               observed_at=started, registered_at=clock(), clock=clock)
