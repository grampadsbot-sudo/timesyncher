"""Install host-handback runtime hook onto the live stall alarm preimage."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
PATCH = SOURCE / 'host-handback-runtime.patch'
MODULES = (
    'host_handback_observation.py',
    'host_handback_entrypoint.py',
    'host_handback_events.py',
    'host_handback_evidence.py',
    'host_handback_review.py',
)
ALARM_NAME = 'tsv_stall_alarm.py'
CONFIG_NAME = 'host-handback-entrypoint.json'
EXPECTED_ALARM_SHA256 = (
    'cd87a62e90a737c53a15284b3ed531aad240ba3293dd4060397ab76f8f661163'
)
WORKTREE_SCOPE = '/home/ubishere9995/tsv-work/'


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def backup_path(root, name):
    stamp = time.strftime('%Y%m%d-%H%M%S')
    return root / ('%s.bak-%s' % (name, stamp))


def backup_file(root, name):
    src = root / name
    if not src.is_file():
        return None
    dest = backup_path(root, name)
    shutil.copy2(src, dest)
    return dest


def load_config_source(path):
    sys.path.insert(0, str(SOURCE))
    from host_handback_entrypoint import load_entrypoint_config
    return load_entrypoint_config(path)


def validate_config_paths(config_path):
    data = json.loads(Path(config_path).read_text())
    if data.get('version') != 1:
        raise SystemExit('config version must be 1')
    for field in (
        'handback_event_paths',
        'acceptance_event_paths',
        'resolution_event_paths',
    ):
        mapping = data.get(field) or {}
        for value in mapping.values():
            if not isinstance(value, str) or not value.startswith(WORKTREE_SCOPE):
                raise SystemExit('config event path must be absolute under %s' % WORKTREE_SCOPE.rstrip('/'))
    return data


def check_runtime(runtime_root):
    runtime_root = Path(runtime_root).expanduser().resolve()
    alarm = runtime_root / ALARM_NAME
    if not alarm.is_file():
        raise SystemExit('missing runtime alarm: %s' % alarm)
    digest = sha256_file(alarm)
    if digest != EXPECTED_ALARM_SHA256:
        raise SystemExit('runtime alarm sha256 mismatch (got %s, need %s)' % (digest, EXPECTED_ALARM_SHA256))
    if not PATCH.is_file():
        raise SystemExit('missing install patch: %s' % PATCH)
    for name in MODULES:
        if not (SOURCE / name).is_file():
            raise SystemExit('missing source module: %s' % name)
    print('check ok runtime=%s alarm_sha256=%s patch_sha256=%s' % (
        runtime_root, digest, sha256_file(PATCH)))
    return runtime_root


def apply_patch(runtime_root):
    alarm = runtime_root / ALARM_NAME
    result = subprocess.run(
        ['patch', '--fuzz=0', '-p0', '-i', str(PATCH)],
        cwd=runtime_root,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit('patch failed: %s' % (result.stderr or result.stdout))


def apply_runtime(runtime_root, config_path):
    runtime_root = check_runtime(runtime_root)
    config_path = Path(config_path).expanduser().resolve()
    if not config_path.is_file():
        raise SystemExit('missing --config: %s' % config_path)
    validate_config_paths(config_path)
    load_config_source(str(config_path))
    backups = []
    for name in (ALARM_NAME, CONFIG_NAME) + tuple(MODULES):
        backed = backup_file(runtime_root, name)
        if backed is not None:
            backups.append(backed)
    for name in MODULES:
        shutil.copy2(SOURCE / name, runtime_root / name)
    shutil.copy2(config_path, runtime_root / CONFIG_NAME)
    apply_patch(runtime_root)
    for name in (ALARM_NAME,) + tuple(MODULES) + (CONFIG_NAME,):
        path = runtime_root / name
        if path.is_file():
            path.chmod(0o644)
    digests = {ALARM_NAME: sha256_file(runtime_root / ALARM_NAME)}
    for name in MODULES + (CONFIG_NAME,):
        digests[name] = sha256_file(runtime_root / name)
    print(json.dumps({'applied': True, 'runtime_root': str(runtime_root), 'backups': [str(p) for p in backups], 'sha256': digests}, indent=2))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root', default='~/tsv-dispatch')
    parser.add_argument('--config', help='host-handback-entrypoint.json source (required for --apply)')
    parser.add_argument('--apply', action='store_true', help='install modules, config, and patch')
    args = parser.parse_args(argv)
    runtime_root = Path(args.runtime_root).expanduser()
    if args.apply:
        if not args.config:
            raise SystemExit('--config is required with --apply')
        apply_runtime(runtime_root, args.config)
    else:
        check_runtime(runtime_root)


if __name__ == '__main__':
    main()
