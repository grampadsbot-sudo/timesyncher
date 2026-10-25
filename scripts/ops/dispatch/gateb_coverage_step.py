from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Sequence

LINUX_ARGV_MAX = 128 * 1024


def paths_payload(paths: Sequence[str]) -> bytes:
    return "\0".join(str(p) for p in paths if str(p).strip()).encode("utf-8")


def argv_bytes(argv: Sequence[str]) -> int:
    total = 0
    for arg in argv:
        total += len(str(arg).encode("utf-8")) + 1
    return total


def run_ui_paths_classifier(ui_paths_script: Path | str, paths: Sequence[str], *, timeout: int = 180):
    script = Path(ui_paths_script)
    cmd = [sys.executable, str(script), "--stdin"]
    return subprocess.run(
        cmd,
        input=paths_payload(paths),
        capture_output=True,
        timeout=timeout,
    )


def coverage_step_passes(ui_paths_script: Path | str, paths: Sequence[str], *, timeout: int = 180) -> bool:
    if not paths:
        return True
    proc = run_ui_paths_classifier(ui_paths_script, paths, timeout=timeout)
    return proc.returncode == 0
