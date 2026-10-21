"""Behavioral regressions for the stall-alarm outer-host CLI entrypoint."""
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE))

from host_handback_entrypoint import (
    CONFIG_NAME,
    ReadOnlyGH,
    load_entrypoint_config,
    run_entrypoint,
)
from host_handback_review import EvidenceError, ReviewScan
from test_host_handback_review import ACTORS, NOW, evidence, issue, receipt

ALARM_SOURCE = SOURCE / 'tsv_stall_alarm.py'
SCOPED_ROOT = Path('/home/ubishere9995/tsv-work/.host-handback-entrypoint-tests')


def scoped_dir(name):
    path = SCOPED_ROOT / ('%s-%d' % (name, os.getpid()))
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_config(root, **fields):
    body = {'version': 1, **fields}
    path = root / CONFIG_NAME
    path.write_text(json.dumps(body))
    return path


class EntrypointConfig(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.event = self.root / '569.json'
        self.event.write_text('{}')

    def tearDown(self):
        self.temp.cleanup()

    def test_missing_config_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'config missing'):
            load_entrypoint_config(self.root / CONFIG_NAME)

    def test_malformed_json_refuses(self):
        path = self.root / CONFIG_NAME
        path.write_text('{bad')
        with self.assertRaisesRegex(EvidenceError, 'unreadable'):
            load_entrypoint_config(path)

    def test_unknown_version_refuses(self):
        folder = scoped_dir('version')
        scoped = folder / 'version.json'
        scoped.write_text('{}')
        try:
            write_config(self.root, version=9, handback_event_paths={'569': str(scoped)})
            with self.assertRaisesRegex(EvidenceError, 'unsupported'):
                load_entrypoint_config(self.root / CONFIG_NAME)
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    def test_relative_event_path_refuses(self):
        write_config(self.root, handback_event_paths={'569': '569.json'})
        with self.assertRaisesRegex(EvidenceError, 'outside scoped'):
            load_entrypoint_config(self.root / CONFIG_NAME)

    def test_empty_config_refuses(self):
        write_config(self.root)
        with self.assertRaisesRegex(EvidenceError, 'no event paths'):
            load_entrypoint_config(self.root / CONFIG_NAME)

    def test_valid_path_map_loads(self):
        folder = scoped_dir('loads')
        scoped = folder / '569.json'
        scoped.write_text('{}')
        try:
            write_config(self.root, handback_event_paths={'569': str(scoped)})
            parsed = load_entrypoint_config(self.root / CONFIG_NAME)
            self.assertEqual(parsed['handback_event_paths'][569], str(scoped))
        finally:
            shutil.rmtree(folder, ignore_errors=True)


class EntrypointCli(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.runtime = self.root / 'runtime'
        self.runtime.mkdir()
        folder = scoped_dir('cli')
        self.event_path = folder / '569.json'
        self.event_path.write_text('{}')
        scoped = self.event_path
        write_config(self.runtime, handback_event_paths={'569': str(scoped)})
        self.scan = ReviewScan(lambda i, c, t: evidence(i, c), ACTORS)
        spec = importlib.util.spec_from_file_location('alarm_cli', ALARM_SOURCE)
        self.alarm = importlib.util.module_from_spec(spec)
        links = types.ModuleType('pr_issue_links')
        links.issue_pr_map = lambda prs: {}
        links.clear_issue_ready = Mock()
        bell = types.ModuleType('bell_gate')
        bell.ring = Mock()
        common = types.ModuleType('tsv_common')
        common.GH = lambda: types.SimpleNamespace(
            pages=Mock(return_value=[]), req=Mock(side_effect=AssertionError('write')))
        common.REPO = 'synthetic/repo'
        common.D = str(self.runtime)
        self.modules = patch.dict(sys.modules, tsv_common=common, pr_issue_links=links, bell_gate=bell)
        self.modules.start()
        spec.loader.exec_module(self.alarm)
        self.alarm.log = Mock()
        self.alarm.auto_fix = Mock(side_effect=AssertionError('generic fix'))
        self.alarm.check_fix_claims = lambda *a: []
        self.alarm.launches_not_started = lambda *a: []
        self.alarm.round_running = Mock(return_value=False)
        (self.runtime / 'stall-alarm-state.json').write_text(json.dumps({'host-review-sent': {}}))

    def tearDown(self):
        self.modules.stop()
        self.temp.cleanup()
        shutil.rmtree(self.event_path.parent, ignore_errors=True)

    def test_run_entrypoint_dry_builds_collector(self):
        gh = Mock()
        gh_factory = Mock(return_value=gh)
        with patch('host_handback_entrypoint.CanonicalCollector') as collector_cls:
            collector_cls.return_value.scan.return_value = self.scan
            dry, scan = run_entrypoint(gh_factory, 'synthetic/repo', str(self.runtime), ['--dry'])
        self.assertTrue(dry)
        self.assertIs(scan, self.scan)
        collector_cls.assert_called_once()
        wrapped = collector_cls.call_args.args[0]
        self.assertIsInstance(wrapped, ReadOnlyGH)

    def test_cli_dry_invokes_main_with_collector(self):
        with patch('host_handback_entrypoint.build_review_scan', return_value=self.scan) as build:
            with patch.object(self.alarm.time, 'time', return_value=NOW):
                with patch('builtins.print'):
                    self.alarm.cli(['prog', '--dry'])
        build.assert_called_once()

    def test_cli_without_config_refuses_before_main(self):
        (self.runtime / CONFIG_NAME).unlink()
        with self.assertRaisesRegex(EvidenceError, 'config missing'):
            self.alarm.cli(['prog', '--dry'])

    def test_main_without_review_scan_still_refuses(self):
        with self.assertRaisesRegex(EvidenceError, 'ReviewScan required'):
            self.alarm.main(dry=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
