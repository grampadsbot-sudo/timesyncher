"""Install #662 vkfill batch hold guards onto Ubuntu ~/tsv-dispatch under the cron lock."""
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
GUARD_MODULE = "vkfill_batch_guards.py"
LANE_AUTOFILL = "lane_autofill.py"
STALL_ALARM = "tsv_stall_alarm.py"
LOCK = Path.home() / "tsv-dispatch" / ".autofill.lock"
DEFAULT_DISPATCH = Path.home() / "tsv-dispatch"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup_file(root: Path, name: str) -> Path | None:
    src = root / name
    if not src.is_file():
        return None
    dest = root / ("%s.bak-%s-662" % (name, time.strftime("%Y%m%d-%H%M%S")))
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
    patched = text
    marker = "vkfill_batch_guards.may_void_held_as_alreadypushed"
    if marker not in patched:
        patched = ensure_import(patched, "vkfill_batch_guards")
        retire_hook = (
            "        alreadypushed = vkfill_batch_guards.may_void_held_as_alreadypushed("
            "sha, branch, ls_remote_lines)\n"
        )
        patterns_retire = [
            (
                r"(\s+)alreadypushed = [^\n]+\n"
                r'(\s+suffix = "alreadypushed" if alreadypushed else "held"\n)'
            ),
            (
                r"(\s+)alreadypushed = [^\n]+\n"
                r"(\s+suffix = 'alreadypushed' if alreadypushed else 'held'\n)"
            ),
        ]
        injected = False
        for pattern in patterns_retire:
            if re.search(pattern, patched):
                patched = re.sub(pattern, r"\1" + retire_hook + r"\2", patched, count=1)
                injected = True
                break
        if not injected:
            raise SystemExit(
                "lane_autofill.py: could not find vkfill-held retire suffix assignment"
            )

    quota_marker = "publish_vkfill_batch(gh, dry)"
    if quota_marker in patched and "skipped low GitHub quota" in patched:
        quota_pos = patched.find("skipped low GitHub quota")
        publish_pos = patched.rfind("publish_vkfill_batch(gh, dry)", 0, quota_pos)
        if publish_pos != -1:
            return patched
    quota_hook = "        publish_vkfill_batch(gh, dry)\n"
    quota_patterns = [
        (
            r"(if core_remaining\(gh\) < 800 and not dry:\s*\n)"
            r'(\s*logline\("lane-autofill: skipped low GitHub quota")'
        ),
        (
            r"(if core_remaining\(gh\) < 800 and not dry:\s*\n)"
            r"(\s*logline\('lane-autofill: skipped low GitHub quota')"
        ),
    ]
    for pattern in quota_patterns:
        if re.search(pattern, patched):
            return re.sub(pattern, r"\1" + quota_hook + r"\2", patched, count=1)
    raise SystemExit(
        "lane_autofill.py: could not find low GitHub quota early-return anchor"
    )


def inject_stall_alarm(text: str) -> str:
    marker = "vkfill_batch_guards.stall_alarm_reason"
    if marker in text:
        return text
    text = ensure_import(text, "vkfill_batch_guards")
    hook = (
        "    vkfill_held_entries = load_vkfill_held_entries()\n"
        "    reason = vkfill_batch_guards.stall_alarm_reason("
        "vkfill_held_entries, time.time(), generic_reason=reason)\n"
    )
    patterns = [
        r"(def stall_reason[^\n]+\n(?:[^\n]*\n)*?\s+reason\s*=\s*[^\n]+\n)(\s+return reason\n)",
        r"(def stall_reason[^\n]+\n(?:[^\n]*\n)*?\s+reason\s*=\s*generic_reason\n)(\s+return reason\n)",
    ]
    for pattern in patterns:
        if re.search(pattern, text):
            return re.sub(pattern, r"\1" + hook + r"\2", text, count=1)
    raise SystemExit("tsv_stall_alarm.py: could not find stall_reason return hook")


def install(root: Path, dry: bool) -> None:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise SystemExit("dispatch root missing: %s" % root)
    module_src = SOURCE / GUARD_MODULE
    if not module_src.is_file():
        raise SystemExit("missing source module %s" % module_src)
    actions = []
    actions.append(("copy", module_src, root / GUARD_MODULE))
    for name, mutator in (
        (LANE_AUTOFILL, inject_lane_autofill),
        (STALL_ALARM, inject_stall_alarm),
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
    lock_path = LOCK if LOCK.parent.exists() else root / ".install-662.lock"
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
