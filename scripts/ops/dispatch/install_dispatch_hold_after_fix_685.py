"""Install #685 hold:after-<N> guard onto Ubuntu ~/tsv-dispatch under the cron lock."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import shutil
import sys
import time
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
GUARD_MODULE = "hold_after_guards.py"
IDLE_CAPACITY = "idle_capacity.py"
LOCK = Path.home() / "tsv-dispatch" / ".autofill.lock"
DEFAULT_DISPATCH = Path.home() / "tsv-dispatch"
LIVE_SHA256_PREFIX = "5f67358fc572"
EXTRA_HOLD_ANCHOR = (
    "def extra_hold_removals(gh, item, latest, now, dry=False, workers=None, open_map=None, pass_state=None):"
)
RESCOPE_ANCHOR = "\ndef rescope_refs("


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup_file(root: Path, name: str) -> Path | None:
    src = root / name
    if not src.is_file():
        return None
    dest = root / ("%s.bak-%s-685" % (name, time.strftime("%Y%m%d-%H%M%S")))
    shutil.copy2(src, dest)
    return dest


def assert_live_anchors(text: str) -> None:
    if EXTRA_HOLD_ANCHOR not in text:
        raise SystemExit(
            "idle_capacity.py: missing extra_hold_removals signature anchor for #685"
        )
    pos = text.find(EXTRA_HOLD_ANCHOR)
    if text.find(RESCOPE_ANCHOR, pos) == -1:
        raise SystemExit(
            "idle_capacity.py: missing rescope_refs anchor after extra_hold_removals"
        )


def inject_extra_hold_removals(text: str) -> str:
    marker = "hold_after_guards.extra_hold_removals("
    if marker in text:
        return text
    assert_live_anchors(text)
    start = text.find(EXTRA_HOLD_ANCHOR)
    end = text.find(RESCOPE_ANCHOR, start)
    delegate = (
        "def extra_hold_removals(gh, item, latest, now, dry=False, workers=None, open_map=None, pass_state=None):\n"
        "    import hold_after_guards\n"
        "    return hold_after_guards.extra_hold_removals(\n"
        "        gh,\n"
        "        item,\n"
        "        latest,\n"
        "        now,\n"
        "        dry=dry,\n"
        "        workers=workers,\n"
        "        open_map=open_map,\n"
        "        pass_state=pass_state,\n"
        "        hold_label_names=_hold_label_names,\n"
        "        label_since=_label_since,\n"
        "        hold_renewed=_hold_renewed,\n"
        "        hold_text=hold_text,\n"
        "        references=references,\n"
        "        rescope_refs=rescope_refs,\n"
        "        dr_post=dr_post,\n"
        "        running=running,\n"
        "        stamp=stamp,\n"
        "        utc=utc,\n"
        "        repo=REPO,\n"
        "        hold_max_s=HOLD_MAX_S,\n"
        "    )\n"
    )
    return text[:start] + delegate + text[end:]


def install(root: Path, dry: bool, require_live_sha: bool) -> None:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise SystemExit("dispatch root missing: %s" % root)
    module_src = SOURCE / GUARD_MODULE
    if not module_src.is_file():
        raise SystemExit("missing source module %s" % module_src)
    idle = root / IDLE_CAPACITY
    if not idle.is_file():
        raise SystemExit("idle_capacity.py missing under %s" % root)
    idle_text = idle.read_text()
    if require_live_sha:
        digest = sha256_file(idle)
        if not digest.startswith(LIVE_SHA256_PREFIX):
            raise SystemExit(
                "idle_capacity.py sha256 mismatch: got %s want prefix %s"
                % (digest, LIVE_SHA256_PREFIX)
            )
    patched = inject_extra_hold_removals(idle_text)
    actions = [
        ("copy", module_src, root / GUARD_MODULE),
        ("patch", IDLE_CAPACITY, patched),
    ]
    if dry:
        for kind, name, payload in actions:
            print("%s %s" % (kind, name if isinstance(name, str) else name))
        print("sha256 %s %s" % (GUARD_MODULE, sha256_file(module_src)))
        print(
            "host install: python3 install_dispatch_hold_after_fix_685.py "
            "--dispatch-root ~/tsv-dispatch --require-live-sha"
        )
        return
    lock_path = LOCK if LOCK.parent.exists() else root / ".install-685.lock"
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
        print("backups: %s" % (", ".join(backups) if backups else "none"))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dispatch-root", default=str(DEFAULT_DISPATCH))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--require-live-sha",
        action="store_true",
        help="fail unless idle_capacity.py sha256 starts with %s" % LIVE_SHA256_PREFIX,
    )
    args = parser.parse_args(argv)
    install(Path(args.dispatch_root), dry=args.dry_run, require_live_sha=args.require_live_sha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
