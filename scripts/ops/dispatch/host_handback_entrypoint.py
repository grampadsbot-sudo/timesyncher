"""Outer-host stall-alarm entrypoint: explicit event-path config and ReviewScan wiring."""
from __future__ import annotations

import json
import re
from pathlib import Path

from host_handback_evidence import CanonicalCollector, HostReaders
from host_handback_review import EvidenceError

CONFIG_VERSION = 1
CONFIG_NAME = 'host-handback-entrypoint.json'
EVENT_PATH_SCOPE = re.compile(
    r'^/home/ubishere9995/(?:tsv-work|gpt-[^/]+)/.+\.json$')
ROOT_SCOPE = re.compile(r'^/home/ubishere9995/(?:tsv-work|gpt-[^/]+)(?:/.*)?$')
PATH_MAP_KEYS = (
    'handback_event_paths',
    'acceptance_event_paths',
    'resolution_event_paths',
)
ROOT_KEYS = (
    'handback_event_root',
    'acceptance_event_root',
    'resolution_event_root',
)


def _require(condition, reason):
    if not condition:
        raise EvidenceError(reason)


def _validate_event_path(path):
    _require(isinstance(path, str) and path, 'event path must be a non-empty string')
    _require(EVENT_PATH_SCOPE.fullmatch(path), 'event path outside scoped host worktree')
    resolved = Path(path).resolve(strict=True)
    _require(str(resolved) == path, 'event path cannot traverse symlinks')
    return path


def _validate_root(path):
    _require(isinstance(path, str) and path, 'event root must be a non-empty string')
    raw = Path(path)
    _require(raw.is_absolute(), 'event root must be absolute')
    text = str(raw)
    _require(ROOT_SCOPE.match(text), 'event root outside scoped host worktree')
    resolved = raw.resolve(strict=True)
    _require(resolved.is_dir(), 'event root is not a directory')
    _require(resolved == raw, 'event root cannot traverse symlinks')
    return str(resolved)


def _parse_item_paths(raw, field):
    _require(isinstance(raw, dict), '%s must be an object' % field)
    out = {}
    for key, value in raw.items():
        try:
            number = int(key)
        except (TypeError, ValueError):
            raise EvidenceError('%s keys must be item numbers' % field) from None
        _require(number > 0, '%s item must be positive' % field)
        out[number] = _validate_event_path(value)
    return out


def load_entrypoint_config(path):
    config_path = Path(path)
    _require(config_path.is_file(), 'host handback entrypoint config missing: %s' % path)
    try:
        data = json.loads(config_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise EvidenceError('host handback entrypoint config unreadable: %s' % type(exc).__name__) from exc
    _require(isinstance(data, dict), 'host handback entrypoint config must be an object')
    version = data.get('version')
    _require(version == CONFIG_VERSION, 'unsupported host handback entrypoint config version')
    extra = set(data) - {'version'} - set(PATH_MAP_KEYS) - set(ROOT_KEYS)
    _require(not extra, 'host handback entrypoint config has unknown fields')
    parsed = {'version': CONFIG_VERSION}
    for field in PATH_MAP_KEYS:
        if field in data:
            parsed[field] = _parse_item_paths(data[field], field)
    for field in ROOT_KEYS:
        if field in data:
            parsed[field] = _validate_root(data[field])
    configured = any(field in parsed for field in PATH_MAP_KEYS + ROOT_KEYS)
    _require(configured, 'host handback entrypoint config has no event paths')
    return parsed


def default_config_path(runtime_root):
    return str(Path(runtime_root) / CONFIG_NAME)


def build_review_scan(gh, repo, runtime_root, config):
    readers = HostReaders(
        runtime_root,
        handback_event_root=config.get('handback_event_root'),
        handback_event_paths=config.get('handback_event_paths'),
        acceptance_event_root=config.get('acceptance_event_root'),
        acceptance_event_paths=config.get('acceptance_event_paths'),
        resolution_event_root=config.get('resolution_event_root'),
        resolution_event_paths=config.get('resolution_event_paths'),
    )
    return CanonicalCollector(gh, repo, readers).scan()


class ReadOnlyGH:
    def __init__(self, gh):
        self._gh = gh

    def req(self, method, *args, **kwargs):
        if method != 'GET':
            raise EvidenceError('dry-run refuses GitHub mutation')
        return self._gh.req(method, *args, **kwargs)

    def pages(self, *args, **kwargs):
        return self._gh.pages(*args, **kwargs)


def parse_cli(argv):
    dry = '--dry' in argv
    config_path = None
    for index, arg in enumerate(argv):
        if arg == '--handback-config' and index + 1 < len(argv):
            config_path = argv[index + 1]
    return dry, config_path


def run_entrypoint(gh_factory, repo, runtime_root, argv):
    dry, config_override = parse_cli(argv)
    config_path = config_override or default_config_path(runtime_root)
    config = load_entrypoint_config(config_path)
    gh = ReadOnlyGH(gh_factory()) if dry else gh_factory()
    review_scan = build_review_scan(gh, repo, runtime_root, config)
    return dry, review_scan
