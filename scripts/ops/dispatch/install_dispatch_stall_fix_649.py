"""Install #649 stall guards onto Ubuntu ~/tsv-dispatch under the cron lock."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import os
import re
import shutil
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
GUARD_MODULE = "dispatch_stall_guards.py"
LANE_AUTOFILL = "lane_autofill.py"
CURSOR_LAUNCH = "cursor_launch.py"
LOCK = Path.home() / "tsv-dispatch" / ".autofill.lock"
DEFAULT_DISPATCH = Path.home() / "tsv-dispatch"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup_file(root: Path, name: str) -> Path | None:
    src = root / name
    if not src.is_file():
        return None
    dest = root / ("%s.bak-%s-649" % (name, time.strftime("%Y%m%d-%H%M%S")))
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


def inject_lane_autofill(text: str) -> str:
    marker = "dispatch_stall_guards.prune_expired_carried"
    if marker in text:
        return text
    text = ensure_import(text, "dispatch_stall_guards")
    patterns = [
        r"(carried\s*=\s*load_json\(CARRIED[^\n]+\)\n)",
        r"(carried\s*=\s*json\.load\(open\(CARRIED[^\n]+\)\n)",
    ]
    hook = (
        "    dispatch_stall_guards.prune_expired_carried(carried, time.time(), log=log.info)\n"
    )
    for pattern in patterns:
        if re.search(pattern, text):
            return re.sub(pattern, r"\1" + hook, text, count=1)
    anchor = "def main("
    pos = text.find(anchor)
    if pos == -1:
        raise SystemExit("lane_autofill.py: could not find carried load or main()")
    insert_at = text.find("\n", pos) + 1
    block = (
        "    carried = load_json(CARRIED) if 'load_json' in globals() else {}\n"
        + hook
    )
    return text[:insert_at] + block + text[insert_at:]


def inject_cursor_launch(text: str) -> str:
    marker = "dispatch_stall_guards.local_lane_owns_issue"
    if marker in text:
        return text
    text = ensure_import(text, "dispatch_stall_guards")
    hook = (
        "    if dispatch_stall_guards.local_lane_owns_issue(WORK_ROOT, issue_n):\n"
        "        return True\n"
    )
    patterns = [
        r"(def local_lane_owns[^\n]+\n(?:[^\n]*\n)*?\s+)(for [^\n]+\n)",
        r"(def issue_locally_owned[^\n]+\n(?:[^\n]*\n)*?\s+)(for [^\n]+\n)",
    ]
    for pattern in patterns:
        if re.search(pattern, text):
            return re.sub(pattern, r"\1" + hook + r"\2", text, count=1)
    if "tsv-work" not in text:
        raise SystemExit("cursor_launch.py: no local-lane hook anchor found")
    return text + (
        "\n\n"
        "def _local_lane_owns_issue_649(issue_n, work_root):\n"
        "    return dispatch_stall_guards.local_lane_owns_issue(work_root, issue_n)\n"
    )


def install(root: Path, dry: bool) -> None:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise SystemExit("dispatch root missing: %s" % root)
    module_src = SOURCE / GUARD_MODULE
    if not module_src.is_file():
        raise SystemExit("missing source module %s" % module_src)
    actions = []
    dest_module = root / GUARD_MODULE
    actions.append(("copy", module_src, dest_module))
    for name, mutator in (
        (LANE_AUTOFILL, inject_lane_autofill),
        (CURSOR_LAUNCH, inject_cursor_launch),
    ):
        target = root / name
        if not target.is_file():
            actions.append(("skip-missing", name, None))
            continue
        updated = mutator(target.read_text())
        actions.append(("patch", name, updated))
    if dry:
        for kind, name, payload in actions:
            print("%s %s" % (kind, name if isinstance(name, str) else name))
        print("sha256 %s %s" % (GUARD_MODULE, sha256_file(module_src)))
        return
    lock_path = LOCK if LOCK.parent.exists() else root / ".install-649.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "w", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        backups = []
        for kind, name, payload in actions:
            if kind == "copy":
                src, dest = name, payload
                backup_file(root, dest.name)
                shutil.copy2(src, dest)
                print("installed %s sha256=%s" % (dest.name, sha256_file(dest)))
            elif kind == "patch":
                backup = backup_file(root, name)
                if backup:
                    backups.append(str(backup))
                (root / name).write_text(payload)
                print("patched %s sha256=%s" % (name, sha256_file(root / name)))
            else:
                print("skipped missing %s" % name)
        print("backups: %s" % (", ".join(backups) if backups else "none"))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dispatch-root", default=str(DEFAULT_DISPATCH))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    install(Path(args.dispatch_root), dry=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
