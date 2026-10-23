"""Pure helpers for lane autofill no-progress PR backoff (#668).

Installed on Ubuntu under ~/tsv-dispatch/; mirrored here for review and CI tests.
"""
from __future__ import annotations

import re
from typing import Callable, Iterable, Mapping, MutableMapping, Sequence

from vkfill_batch_guards import normalize_git_sha

PrNum = int
LaneResult = Mapping
PrRow = Mapping
LogFn = Callable[[str], None]

_recent_by_pr: MutableMapping[PrNum, tuple[LaneResult, ...]] = {}


def _noop_log(_message: str) -> None:
    return None


def clear_recent_cache() -> None:
    _recent_by_pr.clear()


def remember_pr_recent_results(pr_number: PrNum, recent: Sequence[LaneResult]) -> None:
    try:
        n = int(pr_number)
    except (TypeError, ValueError):
        return
    _recent_by_pr[n] = tuple(recent)


def recent_for_pr(pr_number: PrNum) -> tuple[LaneResult, ...]:
    try:
        n = int(pr_number)
    except (TypeError, ValueError):
        return ()
    return _recent_by_pr.get(n, ())


def requeue_token_id(token: str) -> str:
    text = str(token or "").strip()
    if not text:
        return ""
    match = re.search(r"\b([0-9a-f]{7,40})\b", text, re.I)
    if match:
        return match.group(1).lower()
    return text.lower()


def result_requeue_token(result: LaneResult) -> str:
    for key in ("requeue_token", "token", "plan_token", "tier_token"):
        value = result.get(key)
        if value:
            return requeue_token_id(str(value))
    for key in ("summary", "line", "note", "message"):
        text = str(result.get(key) or "")
        match = re.search(r"auto\s+round\s+\d+[^0-9a-f]*([0-9a-f]{7,40})", text, re.I)
        if match:
            return match.group(1).lower()
    return ""


def tokens_match(left: str, right: str) -> bool:
    a = requeue_token_id(left)
    b = requeue_token_id(right)
    if not a or not b:
        return False
    if a == b:
        return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    return len(shorter) >= 7 and longer.startswith(shorter)


def result_is_give_up(result: LaneResult) -> bool:
    if result.get("give_up") or result.get("giveup"):
        return True
    try:
        rc = int(result.get("rc"))
    except (TypeError, ValueError):
        rc = None
    if rc == 5:
        return True
    text = " ".join(
        str(result.get(key) or "")
        for key in ("summary", "line", "note", "message", "outcome")
    ).upper()
    if "GIVEUP" in text or "GIVE UP" in text:
        return True
    if "NOT PUBLISHED" in text and "WITHHELD" in text:
        return True
    if "ROWCHECK-GIVEUP" in text:
        return True
    return False


def result_head_sha(result: LaneResult) -> str:
    for key in ("head_sha", "head", "head_after", "commit", "sha"):
        value = result.get(key)
        if value:
            return normalize_git_sha(value)
    return ""


def result_no_progress(result: LaneResult, pr_head_sha: str) -> bool:
    head = result_head_sha(result)
    pr_head = normalize_git_sha(pr_head_sha)
    if head and pr_head and head == pr_head:
        return True
    if result_is_give_up(result):
        return True
    text = " ".join(
        str(result.get(key) or "")
        for key in ("summary", "line", "note", "message", "outcome")
    ).upper()
    if "PUBLISH: EXISTS" in text and "ALREADY AT" in text:
        return True
    if "ALREADY AT" in text and "PR #" in text:
        return True
    return False


def pr_head_sha(pr_row: PrRow) -> str:
    for key in ("head_sha", "head", "tip_sha", "commit"):
        value = pr_row.get(key)
        if value:
            return normalize_git_sha(value)
    return ""


def pr_requeue_token(pr_row: PrRow) -> str:
    for key in ("requeue_token", "token", "plan_token", "tier_token"):
        value = pr_row.get(key)
        if value:
            return requeue_token_id(str(value))
    return ""


def is_priority_top(pr_row: PrRow) -> bool:
    labels = pr_row.get("labels") or []
    if isinstance(labels, str):
        labels = [labels]
    normalized = {str(label).strip().lower() for label in labels}
    if "priority:top" in normalized:
        return True
    if "critical-path" in normalized:
        return True
    if pr_row.get("priority_top") or pr_row.get("critical_path"):
        return True
    return False


def lane_results_for_pr(results: Iterable[LaneResult], pr_number: PrNum) -> list[LaneResult]:
    try:
        want = int(pr_number)
    except (TypeError, ValueError):
        return []
    out: list[LaneResult] = []
    for result in results or ():
        for key in ("pr", "number", "pr_number"):
            value = result.get(key)
            if value is None:
                continue
            try:
                if int(value) == want:
                    out.append(result)
                    break
            except (TypeError, ValueError):
                continue
    return out


def results_for_token(
    recent_results: Sequence[LaneResult],
    token: str,
) -> list[LaneResult]:
    if not token:
        return []
    out = []
    for result in recent_results:
        if tokens_match(result_requeue_token(result), token):
            out.append(result)
    return out


def token_waiting_first_round(
    pr_row: PrRow,
    recent_results: Sequence[LaneResult],
) -> bool:
    token = pr_requeue_token(pr_row)
    if not token:
        return False
    return len(results_for_token(recent_results, token)) == 0


def noprogress_backoff_active(
    pr_row: PrRow,
    recent_results: Sequence[LaneResult],
) -> bool:
    token = pr_requeue_token(pr_row)
    if not token:
        return False
    on_token = results_for_token(recent_results, token)
    if len(on_token) < 2:
        return False
    head = pr_head_sha(pr_row)
    last_two = on_token[:2]
    return all(result_no_progress(item, head) for item in last_two)


def pr_sort_tier(pr_row: PrRow, recent_results: Sequence[LaneResult]) -> int:
    if noprogress_backoff_active(pr_row, recent_results):
        return 3
    if is_priority_top(pr_row) and token_waiting_first_round(pr_row, recent_results):
        return 0
    if token_waiting_first_round(pr_row, recent_results):
        return 1
    return 2


def pr_created_sort_value(pr_row: PrRow) -> tuple:
    created = pr_row.get("created_at")
    if created is None:
        created = pr_row.get("created")
    if created is None:
        created = 0
    number = pr_row.get("number")
    if number is None:
        number = pr_row.get("pr") or 0
    try:
        number = int(number)
    except (TypeError, ValueError):
        number = 0
    return (created, number)


def with_noprogress_sort(
    base_key: tuple,
    pr_row: PrRow,
    recent_results: Sequence[LaneResult] | None = None,
) -> tuple:
    recent = recent_results or []
    tier = pr_sort_tier(pr_row, recent)
    if isinstance(base_key, tuple):
        return (tier,) + base_key
    return (tier, base_key)


def pr_sort_key_tuple(
    pr_row: PrRow,
    recent_results: Sequence[LaneResult] | None = None,
) -> tuple:
    recent = recent_results or []
    tier = pr_sort_tier(pr_row, recent)
    created, number = pr_created_sort_value(pr_row)
    return (tier, created, number)


def should_skip_launch(
    pr_row: PrRow,
    recent_results: Sequence[LaneResult] | None = None,
) -> tuple[bool, str]:
    recent = recent_results or []
    if noprogress_backoff_active(pr_row, recent):
        detail = "same requeue token, head unchanged or give-up twice"
        return True, detail
    return False, ""


def format_skip_log(pr_number: PrNum, reason: str) -> str:
    return "skip #%s: no-progress backoff (%s)" % (pr_number, reason)


def apply_noprogress_skip(
    pr_row: PrRow,
    recent_results: Sequence[LaneResult] | None,
    log: LogFn | None,
) -> bool:
    skip, reason = should_skip_launch(pr_row, recent_results)
    if not skip:
        return False
    number = pr_row.get("number") or pr_row.get("pr") or "?"
    line = format_skip_log(int(number) if str(number).isdigit() else number, reason)
    (log or _noop_log)(line)
    return True


def sort_pr_rows(
    rows: Iterable[PrRow],
    results_by_pr: Mapping[PrNum, Sequence[LaneResult]] | None = None,
) -> list[PrRow]:
    by_pr = results_by_pr or {}

    def key(row: PrRow) -> tuple:
        number = row.get("number") or row.get("pr")
        try:
            n = int(number)
        except (TypeError, ValueError):
            n = -1
        return pr_sort_key_tuple(row, by_pr.get(n, ()))

    return sorted(list(rows), key=key)
