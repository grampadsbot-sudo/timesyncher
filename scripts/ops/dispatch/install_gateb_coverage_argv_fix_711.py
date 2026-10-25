from __future__ import annotations

import argparse
import fcntl
import hashlib
import re
import shutil
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
GATEB_SOURCE = SOURCE.parent / "gateb"
STEP_MODULE = "gateb_coverage_step.py"
UI_PATHS = "ui_paths.py"
DISPATCH = "tsv_dispatch.py"
LOCK = Path.home() / "tsv-dispatch" / ".autofill.lock"
DEFAULT_DISPATCH = Path.home() / "tsv-dispatch"
DEFAULT_GATEB = Path.home() / "tsv-gateb"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup_file(root: Path, name: str, tag: str) -> Path | None:
    src = root / name
    if not src.is_file():
        return None
    dest = root / ("%s.bak-%s-%s" % (name, time.strftime("%Y%m%d-%H%M%S"), tag))
    shutil.copy2(src, dest)
    return dest


def ensure_import(text: str, module: str) -> str:
    line = "import %s\n" % module
    if line in text or ("from %s import" % module) in text:
        return text
    idx = text.find("\n\n")
    if idx == -1:
        return line + text
    return text[: idx + 1] + line + text[idx + 1 :]


def inject_tsv_dispatch(text: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    marker = "gateb_coverage_step.run_ui_paths_classifier"
    if marker in text:
        return text, notes
    patterns = [
        (
            r"subprocess\.run\(\[sys\.executable,\s*UI_PATHS,\s*\*paths\]",
            "gateb_coverage_step.run_ui_paths_classifier(UI_PATHS, paths)",
        ),
        (
            r"run\(\[sys\.executable,\s*UI_PATHS,\s*\*paths\]",
            "run([sys.executable, UI_PATHS, '--stdin'], input=gateb_coverage_step.paths_payload(paths), "
            "capture_output=True, text=True)",
        ),
    ]
    patched = ensure_import(text, "gateb_coverage_step")
    for pattern, repl in patterns:
        if re.search(pattern, patched):
            patched = re.sub(pattern, repl, patched, count=1)
            return patched, notes
    notes.append("skip-dispatch-hook: no UI_PATHS *paths subprocess.run anchor in tsv_dispatch.py")
    if "GATEB_COVERAGE_711_SKIP_DISPATCH_HOOK" not in patched:
        patched = patched.replace("\n\n", "\nGATEB_COVERAGE_711_SKIP_DISPATCH_HOOK = True\n\n", 1)
    return patched, notes


def install(dispatch_root: Path, gateb_root: Path, *, dry: bool = False) -> None:
    dispatch_root = dispatch_root.expanduser().resolve()
    gateb_root = gateb_root.expanduser().resolve()
    step_src = SOURCE / STEP_MODULE
    ui_src = GATEB_SOURCE / UI_PATHS
    for src in (step_src, ui_src):
        if not src.is_file():
            raise SystemExit("missing source %s" % src)

    def log(msg: str) -> None:
        if dry:
            print(msg)

    if not dry:
        backup_file(dispatch_root, STEP_MODULE, "711")
        backup_file(gateb_root, UI_PATHS, "711")
        shutil.copy2(step_src, dispatch_root / STEP_MODULE)
        shutil.copy2(ui_src, gateb_root / UI_PATHS)

    log("sha256 %s %s" % (STEP_MODULE, sha256_file(step_src)))
    log("sha256 %s %s" % (UI_PATHS, sha256_file(ui_src)))

    dispatch_file = dispatch_root / DISPATCH
    if dispatch_file.is_file():
        text, notes = inject_tsv_dispatch(dispatch_file.read_text())
        for note in notes:
            log(note)
        if not dry:
            dispatch_file.write_text(text)
        log("patch %s" % DISPATCH)
    else:
        log("skip %s (missing)" % DISPATCH)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--dispatch-root", default=str(DEFAULT_DISPATCH))
    parser.add_argument("--gateb-root", default=str(DEFAULT_GATEB))
    args = parser.parse_args(argv)
    root = Path(args.dispatch_root)
    gateb = Path(args.gateb_root)
    if args.dry_run:
        install(root, gateb, dry=True)
        return 0
    lock_path = LOCK
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "w") as lockfh:
        fcntl.flock(lockfh, fcntl.LOCK_EX)
        install(root, gateb, dry=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
