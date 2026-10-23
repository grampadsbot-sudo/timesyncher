#!/usr/bin/env python3
results_by_pr = {}


def logline(msg, dry):
    return None


def pr_sort_key(pr_row):
    number = pr_row.get("number")
    recent = results_by_pr.get(number, ())
    return (pr_row.get("created_at", 0), pr_row.get("number", 0))


def build_queue(pr_rows):
    return sorted(pr_rows, key=pr_sort_key)


def fill_lane(queue, dry=False):
    for pr_row in queue:
        number = pr_row.get("number")
        recent_results = results_by_pr.get(number, ())
        if try_launch_pr(pr_row, recent_results, dry=dry):
            return pr_row
    return None


def try_launch_pr(pr_row, recent_results, dry=False):
    return True
