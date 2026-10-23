"""Pure helpers for vkfill batch hold / push guards (#662).

Installed on Ubuntu under ~/tsv-dispatch/; mirrored here for review and CI tests.
"""
from __future__ import annotations

import re
from typing import Callable, Iterable, Mapping, Sequence

from dispatch_stall_guards import parse_timestamp

IssueNum = int
LsRemoteLines = Sequence[str]


def normalize_git_sha(value) -> str:
    text = str(value or "").strip().lower()
    if text.startswith("sha"):
        text = text[3:].strip()
    if not text:
        return ""
    return text[:40]


def _sha_prefix_match(left: str, right: str, min_len: int = 7) -> bool:
    if not left or not right:
        return False
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    if len(shorter) < min_len:
        return False
    return longer.startswith(shorter)


def ref_matches_remote_name(ref: str, remote_name: str) -> bool:
    ref = str(ref or "").strip()
    remote_name = str(remote_name or "").strip()
    if not ref or not remote_name:
        return False
    if ref == remote_name:
        return True
    if ref.endswith("/" + remote_name):
        return True
    if remote_name.endswith("/" + ref):
        return True
    ref_tail = ref.rsplit("/", 1)[-1]
    name_tail = remote_name.rsplit("/", 1)[-1]
    return ref_tail == name_tail and ref_tail != ""


def parse_ls_remote_tip(lines: LsRemoteLines, branch_ref: str) -> str | None:
    for raw in lines:
        line = str(raw).strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        sha, name = parts[0], parts[1]
        if ref_matches_remote_name(branch_ref, name):
            return normalize_git_sha(sha)
    return None


def remote_branch_contains_held_sha(
    lines: LsRemoteLines,
    branch_ref: str,
    held_sha: str,
) -> bool:
    """True when ls-remote shows the branch tip is the held publish sha."""
    held = normalize_git_sha(held_sha)
    if len(held) < 7:
        return False
    tip = parse_ls_remote_tip(lines, branch_ref)
    if not tip:
        return False
    return _sha_prefix_match(tip, held)


def may_void_held_as_alreadypushed(
    held_sha: str,
    branch_ref: str,
    ls_remote_lines: LsRemoteLines,
    *,
    local_tip_sha: str | None = None,
    last_push_sha: str | None = None,
    last_push_recorded_sha: str | None = None,
) -> bool:
    """Only void a vkfill-held marker as alreadypushed after ls-remote confirms the held sha."""
    if remote_branch_contains_held_sha(ls_remote_lines, branch_ref, held_sha):
        return True
    held = normalize_git_sha(held_sha)
    for candidate in (local_tip_sha, last_push_sha, last_push_recorded_sha):
        if candidate and _sha_prefix_match(normalize_git_sha(candidate), held):
            return False
    return False


def void_marker_suffix(alreadypushed: bool) -> str:
    return "alreadypushed" if alreadypushed else "held"


def held_push_due(entry: Mapping, now: float) -> bool:
    for key in ("push_due", "due_at", "next_push", "push_after", "batch_due"):
        ts = parse_timestamp(entry.get(key))
        if ts is not None:
            return now >= ts
    note = str(entry.get("note") or entry.get("reason") or "")
    match = re.search(r"push\s+due\s+([0-9T:\-+Z]+)", note, re.I)
    if match:
        ts = parse_timestamp(match.group(1))
        if ts is not None:
            return now >= ts
    return False


def held_entry_issue(entry: Mapping) -> IssueNum | None:
    for key in ("pr", "n", "issue", "number", "issue_number"):
        if key in entry:
            try:
                return int(entry[key])
            except (TypeError, ValueError):
                return None
    return None


def held_entry_branch(entry: Mapping) -> str:
    for key in ("branch", "ref", "head_ref", "publish_branch", "vkfill_branch"):
        value = entry.get(key)
        if value:
            return str(value).strip()
    return ""


def held_entry_sha(entry: Mapping) -> str:
    for key in ("sha", "held_sha", "tip", "publish_sha", "commit"):
        value = entry.get(key)
        if value:
            return normalize_git_sha(value)
    return ""


def overdue_held_pushes(
    held_entries: Iterable[Mapping],
    now: float,
) -> list[Mapping]:
    out: list[Mapping] = []
    for entry in held_entries:
        if isinstance(entry, Mapping) and held_push_due(entry, now):
            out.append(entry)
    return out


def autofill_must_run_batch_push(
    skip_reason: str,
    held_entries: Iterable[Mapping],
    now: float,
) -> bool:
    """When the batch window passed, push even if the pass would skip for low GitHub quota."""
    text = str(skip_reason or "").lower()
    if "low github quota" not in text and "github quota" not in text:
        return False
    return bool(overdue_held_pushes(held_entries, now))


def autofill_should_publish_before_quota_skip(
    held_entries: Iterable[Mapping],
    now: float,
) -> bool:
    return bool(overdue_held_pushes(held_entries, now))


def stall_alarm_reason(
    held_entries: Iterable[Mapping],
    now: float,
    generic_reason: str = "stall",
) -> str:
    overdue = overdue_held_pushes(held_entries, now)
    if not overdue:
        return generic_reason
    labels = []
    for entry in overdue:
        branch = held_entry_branch(entry) or "?"
        sha = held_entry_sha(entry) or "?"
        labels.append("%s %s" % (branch, sha))
    return "held, push overdue %s" % ", ".join(labels)


def void_marker_name_is_alreadypushed(name: str) -> bool:
    text = str(name or "")
    return ".void-" in text and text.endswith("-alreadypushed")


def void_alreadypushed_marker_invalid(
    marker_name: str,
    held_sha: str,
    branch_ref: str,
    ls_remote_lines: LsRemoteLines,
) -> bool:
    """True when a voided alreadypushed marker should not have been retired that way."""
    if not void_marker_name_is_alreadypushed(marker_name):
        return False
    return not may_void_held_as_alreadypushed(held_sha, branch_ref, ls_remote_lines)


def rename_void_marker_name(
    issue: IssueNum,
    stamp: str,
    alreadypushed: bool,
) -> str:
    suffix = void_marker_suffix(alreadypushed)
    return "%s.void-%s-%s" % (issue, stamp, suffix)
