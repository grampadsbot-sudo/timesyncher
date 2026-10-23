#!/usr/bin/env python3
"""Verbatim-style excerpt of live lane_autofill.py (sha256 prefix a531dc641892) for #668 tests."""
from __future__ import annotations


def logline(msg, dry=False):
    return None


def covered_by_result(row, results, now, log):
    return False


def pr_sort_key(pr, bad_checks):
    created = pr.get("created_at") or pr.get("created") or 0
    red = 1 if bad_checks else 0
    return (0, created, red, pr["number"])


def build_pr_queue(open_prs, bad_by_pr, results, now, log):
    pr_rows = []
    for pr in open_prs:
        bad = bad_by_pr.get(pr["number"], False)
        row = {
            "number": pr["number"],
            "created_at": pr.get("created_at"),
            "head_sha": pr.get("head_sha"),
            "requeue_token": pr.get("requeue_token"),
            "labels": list(pr.get("labels") or []),
        }
        covered_by_result(row, results, now, log)
        pr_rows.append((pr_sort_key(pr, bad), row))
    pr_rows.sort(key=lambda x: x[0])
    return [pair[1] for pair in pr_rows]


def launch_lane(root, lane, item, dry, log):
    return item.get("number")


def fill_lanes_round_robin(root, lanes, queue, results, dry, log):
    launched = []
    qpos = 0
    while qpos < len(queue) and lanes:
        item = queue[qpos]
        qpos += 1
        lane = lanes[qpos % len(lanes)]
        launch_lane(root, lane, item, dry, log)
        launched.append(item["number"])
    return launched
