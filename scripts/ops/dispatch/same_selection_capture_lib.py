"""Portable helpers for VK #562 same-selection capture (offline tests + optional host replay CLI)."""
import copy
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from capture_replay_binding import (
    CaptureReplayError,
    capture_replay_env_for_pair,
    pair_from_fixture,
)

DEFAULT_SANCTIONED_REPLAY_PRODUCER_HEAD = '1141d5ce833b3648b18f114a95ede1af4b03c265'
_FULL_SHA_RE = re.compile(r'^[0-9a-f]{40}$')

def fixture_selected_keys(trip):
    keys = []
    for place in trip.get('places') or []:
        key = 'place:%s' % place['id']
        if (trip.get('thingOverrides') or {}).get(key, {}).get('timeline') is True:
            keys.append(key)
    return sorted(keys)


def selection_namespace_keys(trip):
    """Timeline explicit selection uses place:{id} for every Thing row (all categories)."""
    return sorted(
        ('place:%s' % p['id'] for p in (trip.get('places') or [])),
        key=lambda k: int(k.split(':')[1]),
    )


def required_hotel_stay_row_titles(hotel_name):
    return [
        'Check-in: %s' % hotel_name,
        'Bed: %s' % hotel_name,
        'Wake: %s' % hotel_name,
        'Check-out: %s' % hotel_name,
    ]


def hotel_stay_row_errors(timeline_titles, hotel_name, hotel_checked):
    titles = list(timeline_titles or [])
    required = required_hotel_stay_row_titles(hotel_name)
    errors = []
    if hotel_checked:
        for row in required:
            if not any(row in t for t in titles):
                errors.append('missing stay row: %s' % row)
    else:
        for row in required:
            if any(row in t for t in titles):
                errors.append('unchecked hotel must omit stay row: %s' % row)
    return errors


def assert_hotel_stay_parity(candidate_titles, reference_titles, hotel_name, hotel_checked):
    errors = []
    for side, titles in (
        ('candidate', candidate_titles),
        ('reference', reference_titles),
    ):
        for msg in hotel_stay_row_errors(titles, hotel_name, hotel_checked):
            errors.append('%s: %s' % (side, msg))
    if errors:
        raise AssertionError('; '.join(errors))


def place_title(trip, place_id):
    place = next(p for p in trip['places'] if p['id'] == place_id)
    ov = (trip.get('thingOverrides') or {}).get('place:%s' % place_id) or {}
    return (ov.get('title') or place.get('name') or '').strip()


def require_selected_titles(timeline_titles, trip):
    for key in fixture_selected_keys(trip):
        pid = int(key.split(':')[1])
        title = place_title(trip, pid)
        if not any(title in row for row in timeline_titles):
            raise AssertionError('selected Thing missing from timeline: %s' % title)


def _repo_root_from_capture_dir(capture_dir):
    return Path(capture_dir).resolve().parents[2]


def _git_head(repo_root):
    proc = subprocess.run(
        ['git', '-C', str(repo_root), 'rev-parse', 'HEAD'],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip().lower()


def _sanctioned_replay_producer_head():
    raw = (os.environ.get('TSV_SANCTIONED_REPLAY_PRODUCER_HEAD') or DEFAULT_SANCTIONED_REPLAY_PRODUCER_HEAD).strip().lower()
    if not _FULL_SHA_RE.match(raw):
        raise CaptureReplayError('same-selection capture requires full 40-char TSV_SANCTIONED_REPLAY_PRODUCER_HEAD')
    return raw


def _anchor_worktree(repo_root):
    for candidate in (
        os.environ.get('TSV_CAPTURE_ANCHOR_WORKTREE', '').strip(),
        os.path.expanduser('~/tsv-dispatch/pr-src'),
        str(repo_root),
    ):
        if candidate and Path(candidate).is_dir():
            return candidate
    raise CaptureReplayError('same-selection capture requires anchor worktree')


def capture_binding_env_for_bytes(
    fixture_bytes,
    fixture_path,
    capture_dir,
    render_head=None,
    replay_producer_head=None,
    anchor_worktree=None,
):
    repo_root = _repo_root_from_capture_dir(capture_dir)
    render = (render_head or _git_head(repo_root)).strip().lower()
    if not _FULL_SHA_RE.match(render):
        raise CaptureReplayError('same-selection capture requires full 40-char render_head')
    producer = (replay_producer_head or _sanctioned_replay_producer_head()).strip().lower()
    digest = hashlib.sha256(fixture_bytes).hexdigest()
    anchor = anchor_worktree or _anchor_worktree(repo_root)
    pair = pair_from_fixture(render, producer, fixture_path, digest)
    env = dict(os.environ)
    env.update(capture_replay_env_for_pair(pair, anchor))
    return env


def node_prepare(fixture_bytes, capture_dir, render_head=None, replay_producer_head=None, anchor_worktree=None):
    timeline_replay = Path(capture_dir) / 'timeline-replay.mjs'
    driver = (
        "import { prepareTimelineReplay } from "
        + json.dumps(timeline_replay.resolve().as_uri())
        + "; import fs from 'node:fs'; const b=fs.readFileSync(process.argv[1]); "
        "const r=prepareTimelineReplay(b); process.stdout.write(JSON.stringify({"
        "timelineReplay:r.timelineReplay,payload_b64:r.payload.toString('base64')}));"
    )
    with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp:
        tmp.write(fixture_bytes)
        path = tmp.name
    try:
        env = capture_binding_env_for_bytes(
            fixture_bytes,
            path,
            capture_dir,
            render_head=render_head,
            replay_producer_head=replay_producer_head,
            anchor_worktree=anchor_worktree,
        )
        out = subprocess.run(
            ['node', '--input-type=module', '-e', driver, path],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
    finally:
        os.unlink(path)
    data = json.loads(out.stdout)
    import base64

    data['payload'] = base64.b64decode(data['payload_b64'])
    return data


def minimal_trip_hotel_unchecked():
    return {
        'places': [
            {'id': 1, 'name': 'Morning Flight', 'category': 'flight'},
            {'id': 25, 'name': 'Hotel Beacon', 'category': 'hotel'},
            {'id': 9, 'name': 'Dinner Spot', 'category': 'restaurant'},
        ],
        'thingOverrides': {
            'place:1': {'timeline': True},
            'place:9': {'timeline': True},
            'place:25': {},
        },
        'assignments': {'place:1': [1], 'place:25': [1, 2], 'place:9': [1]},
        'days': [{'id': 10, 'day_number': 1}],
    }


def trip_without_timeline_materialized(served, original):
    restored = copy.deepcopy(served)
    original_overrides = original.get('thingOverrides') or {}
    for place in original.get('places') or []:
        key = 'place:%s' % place['id']
        if key not in original_overrides:
            restored.get('thingOverrides', {}).pop(key, None)
        elif 'timeline' not in original_overrides[key]:
            restored['thingOverrides'][key].pop('timeline', None)
    return restored
