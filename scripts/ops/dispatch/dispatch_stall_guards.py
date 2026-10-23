"""Pure helpers for tsv-dispatch stall fixes (#649).

Installed on Ubuntu under ~/tsv-dispatch/; mirrored here for review and CI tests.
"""
from __future__ import annotations

import datetime as dt
import os
import re
from typing import Callable, Iterable, Mapping, MutableMapping, Sequence

IssueNum = int
PidAlive = Callable[[int], bool]
LogFn = Callable[[str], None]


def _noop_log(_message: str) -> None:
    return None


def parse_timestamp(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        return float(text)
    try:
        parsed = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.timestamp()


def carried_hold_until(entry: Mapping) -> float | None:
    for key in ("hold_until", "until", "hold_expires", "hold_expires_at"):
        ts = parse_timestamp(entry.get(key))
        if ts is not None:
            return ts
    note = str(entry.get("note") or entry.get("reason") or "")
    match = re.search(r"hold\s+(?:until|expires)\s+([0-9T:\-+Z]+)", note, re.I)
    if match:
        return parse_timestamp(match.group(1))
    return None


def carried_issue_number(entry: Mapping) -> IssueNum | None:
    for key in ("n", "issue", "number", "issue_number"):
        if key in entry:
            try:
                return int(entry[key])
            except (TypeError, ValueError):
                return None
    return None


def carried_entry_blocks(entry: Mapping, now: float) -> bool:
    hold_until = carried_hold_until(entry)
    if hold_until is None:
        return True
    return hold_until > now


def prune_expired_carried(
    carried: MutableMapping,
    now: float,
    log: LogFn | None = None,
) -> list[str]:
    """Drop carried rows whose hold is in the past; return log lines."""
    logger = log or _noop_log
    lines: list[str] = []
    items = carried.get("items")
    if isinstance(items, list):
        kept = []
        for entry in items:
            if not isinstance(entry, dict):
                kept.append(entry)
                continue
            hold_until = carried_hold_until(entry)
            issue = carried_issue_number(entry)
            if hold_until is not None and hold_until <= now:
                label = "#%s" % issue if issue is not None else "?"
                lines.append(
                    "carried drop %s hold expired (until %s, now %s)"
                    % (label, hold_until, now)
                )
                logger(lines[-1])
                continue
            kept.append(entry)
        carried["items"] = kept
        return lines

    if isinstance(carried, dict):
        drop_keys = []
        for key, entry in list(carried.items()):
            if not isinstance(entry, dict):
                continue
            hold_until = carried_hold_until(entry)
            if hold_until is not None and hold_until <= now:
                drop_keys.append(key)
                lines.append(
                    "carried drop #%s hold expired (until %s, now %s)"
                    % (key, hold_until, now)
                )
                logger(lines[-1])
        for key in drop_keys:
            carried.pop(key, None)
    return lines


def carried_blocks_issue(carried: Mapping, issue: IssueNum, now: float) -> bool:
    items = carried.get("items")
    if isinstance(items, list):
        for entry in items:
            if not isinstance(entry, dict):
                continue
            if carried_issue_number(entry) == issue and carried_entry_blocks(entry, now):
                return True
        return False
    entry = carried.get(str(issue)) or carried.get(issue)
    if isinstance(entry, dict):
        return carried_entry_blocks(entry, now)
    return False


def issue_from_folder_name(name: str) -> IssueNum | None:
    match = re.search(r"(?:^|[-_/])(?:vkfill|issue|tsv)-(\d+)", name, re.I)
    if match:
        return int(match.group(1))
    match = re.search(r"#(\d+)", name)
    if match:
        return int(match.group(1))
    return None


def read_recorded_pid(folder: os.PathLike | str) -> int | None:
    base = os.path.join(str(folder), "")
    for name in ("pid", "launch.pid", ".pid", "runner.pid"):
        path = os.path.join(base, name)
        if not os.path.isfile(path):
            continue
        try:
            raw = open(path, encoding="utf-8").read().strip().split()
            if not raw:
                continue
            return int(raw[0])
        except (OSError, ValueError):
            continue
    return None


def default_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.path.isdir("/proc/%d" % pid):
        return True
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def work_folder_owner_issue(
    folder: os.PathLike | str,
    pid_alive: PidAlive = default_pid_alive,
    read_pid: Callable[[os.PathLike | str], int | None] | None = None,
) -> tuple[IssueNum | None, str]:
    read_pid = read_pid or read_recorded_pid
    issue = issue_from_folder_name(os.path.basename(str(folder).rstrip("/")))
    pid = read_pid(folder)
    if pid is None:
        return issue, "missing_pid"
    if not pid_alive(pid):
        return issue, "dead_pid"
    return issue, "live"


def local_lane_owned_issues(
    work_root: os.PathLike | str,
    pid_alive: PidAlive = default_pid_alive,
    list_dirs: Callable[[str], Sequence[str]] | None = None,
    read_pid: Callable[[os.PathLike | str], int | None] | None = None,
) -> tuple[set[IssueNum], list[str]]:
    """Return issue numbers locally owned via live work folders only."""
    list_dirs = list_dirs or os.listdir
    owned: set[IssueNum] = set()
    stale_notes: list[str] = []
    if not os.path.isdir(work_root):
        return owned, stale_notes
    for name in list_dirs(work_root):
        if name.startswith("."):
            continue
        folder = os.path.join(work_root, name)
        if not os.path.isdir(folder):
            continue
        issue, status = work_folder_owner_issue(folder, pid_alive=pid_alive, read_pid=read_pid)
        if issue is None:
            continue
        if status == "live":
            owned.add(issue)
        elif status in ("missing_pid", "dead_pid"):
            stale_notes.append("%s issue #%s (%s)" % (name, issue, status))
    return owned, stale_notes


def local_lane_owns_issue(
    work_root: os.PathLike | str,
    issue: IssueNum,
    pid_alive: PidAlive = default_pid_alive,
    list_dirs: Callable[[str], Sequence[str]] | None = None,
    read_pid: Callable[[os.PathLike | str], int | None] | None = None,
) -> bool:
    owned, _notes = local_lane_owned_issues(
        work_root,
        pid_alive=pid_alive,
        list_dirs=list_dirs,
        read_pid=read_pid,
    )
    return issue in owned
