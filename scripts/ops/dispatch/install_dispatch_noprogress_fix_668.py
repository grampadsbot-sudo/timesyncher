"""Install #668 no-progress PR backoff onto Ubuntu ~/tsv-dispatch under the cron lock."""
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
GUARD_MODULE = "lane_autofill_noprogress_guards.py"
LANE_AUTOFILL = "lane_autofill.py"
TEST_LANE_AUTOFILL = "tests/test_lane_autofill.py"
LOCK = Path.home() / "tsv-dispatch" / ".autofill.lock"
DEFAULT_DISPATCH = Path.home() / "tsv-dispatch"
TEST_CLASS_MARKER = "class NoProgressBackoff668"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup_file(root: Path, name: str) -> Path | None:
    src = root / name
    if not src.is_file():
        return None
    dest = root / ("%s.bak-%s-668" % (name.replace("/", "-"), time.strftime("%Y%m%d-%H%M%S")))
    dest.parent.mkdir(parents=True, exist_ok=True)
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


def inject_pr_sort_key(text: str) -> str:
    marker = "lane_autofill_noprogress_guards.pr_sort_key_tuple"
    if marker in text:
        return text
    text = ensure_import(text, "lane_autofill_noprogress_guards")
    pattern = r"def pr_sort_key\(([^)]*)\):\n(?:(?:    .+\n)+)"
    match = re.search(pattern, text)
    if not match:
        raise SystemExit("lane_autofill.py: could not find pr_sort_key()")
    arg = match.group(1).strip().split(",")[0].strip() or "pr_row"
    replacement = (
        "def pr_sort_key(%s):\n"
        "    recent = []\n"
        "    if 'results_by_pr' in globals():\n"
        "        number = None\n"
        "        if isinstance(%s, dict):\n"
        "            number = %s.get('number') or %s.get('pr')\n"
        "        else:\n"
        "            number = getattr(%s, 'number', None)\n"
        "        if number is not None:\n"
        "            recent = results_by_pr.get(number, ())\n"
        "    return lane_autofill_noprogress_guards.pr_sort_key_tuple(%s, recent)\n\n"
        % (arg, arg, arg, arg, arg, arg)
    )
    return text[: match.start()] + replacement + text[match.end() :]


def inject_launch_skip(text: str) -> str:
    marker = "lane_autofill_noprogress_guards.apply_noprogress_skip"
    if marker in text:
        return text
    text = ensure_import(text, "lane_autofill_noprogress_guards")
    hook = (
        "        if lane_autofill_noprogress_guards.apply_noprogress_skip("
        "pr_row, recent_results, log=logline):\n"
        "            continue\n"
    )
    patterns = [
        (
            r"(for pr_row in queue:\n"
            r"(?:    .+\n)*?"
            r"(\s+)recent_results = )"
        ),
        (
            r"(for pr_row in pr_queue:\n"
            r"(?:    .+\n)*?"
            r"(\s+)recent_results = )"
        ),
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            indent = match.group(2)
            insert = match.group(1) + hook.replace("        ", indent)
            return text[: match.start()] + insert + text[match.end() :]
    simple_patterns = [
        r"(for pr_row in queue:\n)",
        r"(for pr_row in pr_queue:\n)",
    ]
    for pattern in simple_patterns:
        if re.search(pattern, text):
            return re.sub(pattern, r"\1" + hook, text, count=1)
    raise SystemExit("lane_autofill.py: could not find PR launch loop for no-progress skip")


def inject_lane_autofill(text: str) -> str:
    text = inject_pr_sort_key(text)
    text = inject_launch_skip(text)
    return text


def inject_test_lane_autofill(text: str) -> str:
    if TEST_CLASS_MARKER in text:
        return text
    repo_test = SOURCE / "test_lane_autofill.py"
    if not repo_test.is_file():
        raise SystemExit("missing mirrored test_lane_autofill.py")
    snippet = repo_test.read_text()
    start = snippet.find(TEST_CLASS_MARKER)
    if start == -1:
        raise SystemExit("test_lane_autofill.py: missing NoProgressBackoff668 class")
    block = "\n\n" + snippet[start:].strip() + "\n"
    if "import lane_autofill_noprogress_guards" not in text:
        text = ensure_import(text, "lane_autofill_noprogress_guards")
    return text.rstrip() + block


def install(root: Path, dry: bool) -> None:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise SystemExit("dispatch root missing: %s" % root)
    module_src = SOURCE / GUARD_MODULE
    if not module_src.is_file():
        raise SystemExit("missing source module %s" % module_src)
    actions = []
    actions.append(("copy", module_src, root / GUARD_MODULE))
    lane = root / LANE_AUTOFILL
    if lane.is_file():
        actions.append(("patch", LANE_AUTOFILL, inject_lane_autofill(lane.read_text())))
    else:
        actions.append(("skip-missing", LANE_AUTOFILL, None))
    test_path = root / TEST_LANE_AUTOFILL
    if test_path.is_file():
        actions.append(
            ("patch", TEST_LANE_AUTOFILL, inject_test_lane_autofill(test_path.read_text()))
        )
    else:
        actions.append(("skip-missing", TEST_LANE_AUTOFILL, None))
    if dry:
        for kind, name, payload in actions:
            print("%s %s" % (kind, name if isinstance(name, str) else name))
        print("sha256 %s %s" % (GUARD_MODULE, sha256_file(module_src)))
        return
    lock_path = LOCK if LOCK.parent.exists() else root / ".install-668.lock"
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
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(payload)
                print("patched %s sha256=%s" % (name, sha256_file(target)))
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
