import os
import subprocess
import sys

GATEB = os.path.expanduser("~/tsv-gateb")
UI_PATHS = os.path.join(GATEB, "ui_paths.py")


def gateb_coverage_classify_paths(paths):
    return subprocess.run([sys.executable, UI_PATHS, *paths], capture_output=True, text=True)
