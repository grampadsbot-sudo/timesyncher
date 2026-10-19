import importlib.util
import os
from pathlib import Path


def load_checker():
    root = Path(os.environ.get("TSV_GATEB_ROOT", Path.home() / "tsv-gateb"))
    spec = importlib.util.spec_from_file_location("restore_check", root / "restore_check.py")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    return checker
