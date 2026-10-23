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
LIVE_SHA256_PREFIX = "a531dc641892"

QUEUE_APPEND_RE = re.compile(
    r"^(\s*)pr_rows\.append\(\(pr_sort_key\(pr,\s*(\w+)\),\s*row\)\)\s*$",
    re.MULTILINE,
)
PR_SORT_KEY_DEF_RE = re.compile(r"def pr_sort_key\(pr,\s*(\w+)\):")
LAUNCH_LANE_RE = re.compile(
    r"^(\s*)if\s+launch_lane\((root,\s*lane,\s*item,\s*dry,\s*log)\):\s*$",
    re.MULTILINE,
)


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
    future = "from __future__ import"
    pos = text.find(future)
    if pos != -1:
        end = text.find("\n", pos)
        if end != -1:
            return text[: end + 1] + line + text[end + 1 :]
    match = re.search(r'^(\s*import\s+\w+.*\n)+', text, re.MULTILINE)
    if match:
        insert_at = match.end()
        return text[:insert_at] + line + text[insert_at:]
    idx = text.find("\n\n")
    if idx == -1:
        return line + text
    return text[: idx + 1] + line + text[idx + 1 :]


def assert_live_anchors(text: str) -> None:
    if not PR_SORT_KEY_DEF_RE.search(text):
        raise SystemExit(
            "lane_autofill.py: missing def pr_sort_key(pr, bad_checks) anchor for #668"
        )
    if not QUEUE_APPEND_RE.search(text):
        raise SystemExit(
            "lane_autofill.py: missing pr_rows.append((pr_sort_key(pr, bad), row)) anchor"
        )
    if not LAUNCH_LANE_RE.search(text):
        raise SystemExit(
            "lane_autofill.py: missing if launch_lane(root, lane, item, dry, log): anchor"
        )


def inject_queue_builder(text: str) -> str:
    marker = "lane_autofill_noprogress_guards.with_noprogress_sort"
    if marker in text:
        return text
    text = ensure_import(text, "lane_autofill_noprogress_guards")
    match = QUEUE_APPEND_RE.search(text)
    if not match:
        raise SystemExit(
            "lane_autofill.py: could not find pr_rows.append((pr_sort_key(pr, bad), row))"
        )
    indent = match.group(1)
    bad_name = match.group(2)
    replacement = (
        "%s_np_recent = lane_autofill_noprogress_guards.lane_results_for_pr(results, pr.get(\"number\"))\n"
        "%slane_autofill_noprogress_guards.remember_pr_recent_results(pr.get(\"number\"), _np_recent)\n"
        "%spr_rows.append((lane_autofill_noprogress_guards.with_noprogress_sort("
        "pr_sort_key(pr, %s), row, _np_recent), row))\n"
        % (indent, indent, indent, bad_name)
    )
    return text[: match.start()] + replacement + text[match.end() :]


def inject_launch_skip(text: str) -> str:
    if "apply_noprogress_skip(item, _np_recent, log)" in text:
        return text
    text = ensure_import(text, "lane_autofill_noprogress_guards")
    match = LAUNCH_LANE_RE.search(text)
    if not match:
        raise SystemExit(
            "lane_autofill.py: could not find if launch_lane(root, lane, item, dry, log): for skip hook"
        )
    indent = match.group(1)
    launch_args = match.group(2)
    hook = (
        "%s_np_recent = lane_autofill_noprogress_guards.recent_for_pr(item.get(\"number\"))\n"
        "%sif lane_autofill_noprogress_guards.apply_noprogress_skip(item, _np_recent, log):\n"
        "%s    continue\n"
        "%sif launch_lane(%s):\n"
        % (indent, indent, indent + "    ", indent, launch_args)
    )
    original = match.group(0) + "\n"
    if original not in text:
        raise SystemExit("lane_autofill.py: if launch_lane(...) line anchor drifted")
    return text.replace(original, hook, 1)


def inject_lane_autofill(text: str) -> str:
    if "with_noprogress_sort" in text and "apply_noprogress_skip(item, _np_recent, log)" in text:
        return text
    assert_live_anchors(text)
    text = inject_queue_builder(text)
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


def install(root: Path, dry: bool, require_live_sha: bool) -> None:
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
        lane_text = lane.read_text()
        if require_live_sha:
            digest = sha256_file(lane)
            if not digest.startswith(LIVE_SHA256_PREFIX):
                raise SystemExit(
                    "lane_autofill.py sha256 mismatch: got %s want prefix %s"
                    % (digest, LIVE_SHA256_PREFIX)
                )
        actions.append(("patch", LANE_AUTOFILL, inject_lane_autofill(lane_text)))
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
        print(
            "host install: python3 install_dispatch_noprogress_fix_668.py "
            "--dispatch-root ~/tsv-dispatch --require-live-sha"
        )
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
    parser.add_argument(
        "--require-live-sha",
        action="store_true",
        help="fail unless lane_autofill.py sha256 starts with %s" % LIVE_SHA256_PREFIX,
    )
    args = parser.parse_args(argv)
    install(Path(args.dispatch_root), dry=args.dry_run, require_live_sha=args.require_live_sha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
