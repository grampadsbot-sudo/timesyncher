"""Offline install regressions for host-handback runtime patch."""
import ast
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SOURCE = Path(__file__).resolve().parent
INSTALL = SOURCE / 'install_host_handback_runtime.py'
PREIMAGE = Path('/home/ubishere9995/tsv-work/dr569-preimage-20261021-0850/tsv_stall_alarm.py')
PROOF_CONFIG = Path('/home/ubishere9995/tsv-work/dr569-preimage-20261021-0850/cli-config-trigger.json')
EXPECTED_SHA = 'cd87a62e90a737c53a15284b3ed531aad240ba3293dd4060397ab76f8f661163'
MUTABLE_FUNCS = frozenset({'main', 'check_fix_claims', 'cli'})


def function_asts(path):
    tree = ast.parse(Path(path).read_text())
    return {node.name: ast.dump(node) for node in tree.body if isinstance(node, ast.FunctionDef)}


def write_runtime_stubs(runtime):
    runtime = Path(runtime)
    (runtime / 'tsv_common.py').write_text(
        'class _GH:\n'
        '    def pages(self, path):\n'
        '        return []\n'
        '    def req(self, *a, **k):\n'
        '        return {}\n'
        'GH = lambda: _GH()\n'
        'REPO = "synthetic/repo"\n'
        'D = %r\n' % str(runtime))
    (runtime / 'pr_issue_links.py').write_text(
        'def issue_pr_map(prs):\n'
        '    return {}\n'
        'def clear_issue_ready(g, n):\n'
        '    raise AssertionError("unexpected clear")\n')
    (runtime / 'bell_gate.py').write_text('def ring(*a, **k):\n    return "ok"\n')
    (runtime / 'logs').mkdir(exist_ok=True)
    (runtime / 'stall-alarm-state.json').write_text(json.dumps({'host-review-sent': {}}))


def parse_apply_json(stdout):
    start = stdout.index('{')
    return json.loads(stdout[start:])


def run_install(runtime, config=None, apply=False):
    cmd = [sys.executable, str(INSTALL), '--runtime-root', str(runtime)]
    if config is not None:
        cmd.extend(['--config', str(config)])
    if apply:
        cmd.append('--apply')
    return subprocess.run(cmd, capture_output=True, text=True)


class RuntimeInstall(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.runtime = Path(self.temp.name) / 'runtime'
        self.runtime.mkdir()
        shutil.copy2(PREIMAGE, self.runtime / 'tsv_stall_alarm.py')
        write_runtime_stubs(self.runtime)

    def tearDown(self):
        self.temp.cleanup()

    def test_installed_runtime_contains_launch_identity_consumer(self):
        result = run_install(self.runtime, config=PROOF_CONFIG, apply=True)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        probe = subprocess.run([
            sys.executable, '-I', '-c',
            "import sys; sys.path.insert(0, sys.argv[1]); "
            "from host_handback_launch_identity import issue_body_sha256; "
            "assert issue_body_sha256('launch body') == "
            "'57e49e7161139e75eab0f928d46540db0e947cda76e1accf0afb4ae89854e0f6'",
            str(self.runtime),
        ], capture_output=True, text=True)
        self.assertEqual(probe.returncode, 0, probe.stderr or probe.stdout)

    def test_check_accepts_preimage_sha(self):
        result = run_install(self.runtime)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertIn(EXPECTED_SHA, result.stdout)

    def test_wrong_preimage_sha_refuses(self):
        alarm = self.runtime / 'tsv_stall_alarm.py'
        alarm.chmod(0o644)
        alarm.write_text(alarm.read_text() + '\n')
        result = run_install(self.runtime)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('sha256 mismatch', result.stderr + result.stdout)

    def test_missing_config_refuses_before_apply(self):
        result = run_install(self.runtime, config=self.runtime / 'missing.json', apply=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('missing --config', result.stderr + result.stdout)
        self.assertEqual(
            EXPECTED_SHA,
            __import__('hashlib').sha256((self.runtime / 'tsv_stall_alarm.py').read_bytes()).hexdigest(),
        )

    def test_apply_creates_backups_and_patches_alarm(self):
        self.assertTrue(PROOF_CONFIG.is_file())
        before = function_asts(PREIMAGE)
        result = run_install(self.runtime, config=PROOF_CONFIG, apply=True)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        payload = parse_apply_json(result.stdout)
        self.assertTrue(payload['backups'])
        alarm = self.runtime / 'tsv_stall_alarm.py'
        self.assertNotEqual(__import__('hashlib').sha256(alarm.read_bytes()).hexdigest(), EXPECTED_SHA)
        compile(alarm.read_text(), str(alarm), 'exec')
        after = function_asts(alarm)
        for name, dump in before.items():
            if name in MUTABLE_FUNCS:
                continue
            self.assertEqual(dump, after.get(name), name)

    def test_patched_alarm_dry_reaches_collector(self):
        review_spec = importlib.util.spec_from_file_location(
            'test_host_handback_review', SOURCE / 'test_host_handback_review.py')
        review = importlib.util.module_from_spec(review_spec)
        review_spec.loader.exec_module(review)
        ACTORS, ReviewScan, evidence = review.ACTORS, review.ReviewScan, review.evidence
        result = run_install(self.runtime, config=PROOF_CONFIG, apply=True)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        sys.path.insert(0, str(self.runtime))
        try:
            spec = importlib.util.spec_from_file_location(
                'patched_alarm', self.runtime / 'tsv_stall_alarm.py')
            alarm = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(alarm)
            entry = importlib.import_module('host_handback_entrypoint')
            scan = ReviewScan(lambda i, c, t: evidence(i, c), ACTORS)
            alarm.log = Mock()
            alarm.auto_fix = Mock(side_effect=AssertionError('generic fix'))
            alarm.check_fix_claims = lambda *a: []
            alarm.launches_not_started = lambda *a: []
            alarm.round_running = Mock(return_value=False)
            with patch.object(entry, 'build_review_scan', return_value=scan) as build:
                with patch('builtins.print'):
                    alarm.cli(['prog', '--dry'])
            build.assert_called_once()
        finally:
            sys.path.remove(str(self.runtime))
            for name in list(sys.modules):
                if name.startswith('patched_alarm') or name == 'host_handback_entrypoint':
                    sys.modules.pop(name, None)


if __name__ == '__main__':
    unittest.main(verbosity=2)
