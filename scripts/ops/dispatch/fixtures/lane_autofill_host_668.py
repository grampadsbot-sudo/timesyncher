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
    return True


def simulate_autofill_pass(root, order, queue, dry, log):
    """Mirror live nested fill_lanes_round_robin closure (no args, nonlocal qpos)."""
    free_by_lane = {lane: 1 for lane in order}
    qpos = 0
    launches = 0
    launched = []

    def fill_lanes_round_robin():
        nonlocal qpos, launches
        while qpos < len(queue) and any(free_by_lane.get(l, 0) > 0 for l in order):
            for lane in order:
                if free_by_lane.get(lane, 0) <= 0:
                    continue
                if qpos >= len(queue):
                    break
                item = queue[qpos]
                qpos += 1
                if launch_lane(root, lane, item, dry, log):
                    launches += 1
                    free_by_lane[lane] -= 1
                    launched.append(item["number"])

    fill_lanes_round_robin()
    return launched
