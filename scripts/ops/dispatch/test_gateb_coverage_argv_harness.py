import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "gateb"))

import gateb_coverage_step as step
from ui_paths import LINUX_ARGV_MAX, argv_bytes, read_paths_file


GATEB = Path(__file__).resolve().parent.parent / "gateb"
UI_PATHS = GATEB / "ui_paths.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def huge_path_list():
    paths = [
        "scripts/ops/dispatch/extra-padding-for-argv-limit-test-%05d.mjs" % i
        for i in range(4999)
    ]
    paths.append("src/vacation/extra-padding-for-argv-limit-test-render-path.mjs")
    argv = [sys.executable, str(UI_PATHS), *paths]
    self = argv_bytes(argv)
    assert self > LINUX_ARGV_MAX, "test setup: path list must exceed argv limit (%d <= %d)" % (
        self,
        LINUX_ARGV_MAX,
    )
    return paths


class CoverageArgvHarness(unittest.TestCase):
    def test_huge_list_exceeds_argv_limit(self):
        paths = huge_path_list()
        payload = step.paths_payload(paths)
        self.assertGreater(len(payload), LINUX_ARGV_MAX)

    def test_coverage_step_passes_via_stdin(self):
        paths = huge_path_list()
        self.assertTrue(step.coverage_step_passes(UI_PATHS, paths))
        proc = step.run_ui_paths_classifier(UI_PATHS, paths)
        self.assertEqual(proc.returncode, 0, proc.stderr.decode("utf-8", "replace")[:500])
        self.assertIn(b"RENDER  src/vacation/", proc.stdout)

    def test_paths_file_round_trip(self):
        paths = huge_path_list()
        tmp = tempfile.mkdtemp(prefix="ui-paths-711-")
        try:
            blob_path = Path(tmp) / "paths.bin"
            blob_path.write_bytes(step.paths_payload(paths))
            loaded = read_paths_file(blob_path)
            self.assertEqual(len(loaded), len(paths))
            proc = subprocess_run_paths_file(blob_path)
            self.assertEqual(proc.returncode, 0, proc.stderr.decode("utf-8", "replace"))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def subprocess_run_paths_file(blob_path):
    import subprocess

    return subprocess.run(
        [sys.executable, str(UI_PATHS), "--paths-file", str(blob_path)],
        capture_output=True,
        timeout=180,
    )


class HostDispatchPatch(unittest.TestCase):
    def test_fixture_uses_star_argv(self):
        text = (FIXTURES / "tsv_dispatch_host_711_coverage_argv.py").read_text()
        self.assertIn("UI_PATHS, *paths", text)


if __name__ == "__main__":
    unittest.main()
