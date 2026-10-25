"""Issue ownership and ready-label cleanup when an open PR takes over work."""
import re
from pathlib import Path

from tsv_common import D, REPO


def linked_issues(pr):
    if pr.get("state", "open") != "open":
        return set()
    body = pr.get("body") or ""
    nums = {int(n) for n in re.findall(
        r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)(?:\s+|\s*\(\s*)#(\d+)\b", body, re.I)}
    branch = (pr.get("head") or {}).get("ref") or ""
    nums.update(int(n) for n in re.findall(
        r"(?:^|/)vk(?:fill|clear)[/-](\d+)(?=[/-]|$)", branch))
    return nums


def issue_pr_map(prs):
    covered = {}
    for pr in prs:
        for n in linked_issues(pr):
            covered.setdefault(n, pr["number"])
    return covered


def clear_issue_ready(gh, number):
    """Idempotent, narrow cleanup; preserve all other issue labels."""
    gh.req("DELETE", "/repos/%s/issues/%d/labels/status%%3Aready" % (REPO, number), ok404=True)
    Path(D, "auto-filler", "requeue", str(number)).unlink(missing_ok=True)
