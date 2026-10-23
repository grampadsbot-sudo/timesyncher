#!/usr/bin/env python3
"""Minimal excerpt of live ~/tsv-dispatch/lane_autofill.py for #662 installer tests."""
import json
import os
import time

VKFILL_HELD = "auto-filler/vkfill-held"
VKFILL_LAST_PUSH = "auto-filler/vkfill-last-push.json"


def logline(msg, dry):
    return None


def core_remaining(gh):
    return gh.remaining


def git_ls_remote_lines(gh):
    return gh.ls_remote_lines


def vkfill_mark(issue_n, ref, tip, sha):
    os.makedirs(VKFILL_HELD, exist_ok=True)
    path = os.path.join(VKFILL_HELD, str(issue_n))
    payload = {"ref": ref, "tip": tip, "sha": sha}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    return path


def vkfill_held(n, branch, sha, push_due_ts=None):
    vkfill_mark(n, branch, branch, sha)
    if push_due_ts is not None:
        path = os.path.join(VKFILL_HELD, str(n))
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
        payload["branch"] = branch
        payload["publish_branch"] = branch
        payload["sha"] = sha
        payload["push_due"] = push_due_ts
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)


def load_vkfill_held_entries():
    root = VKFILL_HELD
    if not os.path.isdir(root):
        return []
    out = []
    for name in os.listdir(root):
        if ".void-" in name:
            continue
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
        payload.setdefault("n", name.split(".")[0])
        out.append(payload)
    return out


def publish_vkfill_batch(gh, dry):
    gh.publish_calls.append(time.time())


def main(gh, dry=False):
    if core_remaining(gh) < 800 and not dry:
        logline("lane-autofill: skipped low GitHub quota", dry)
        return
    publish_vkfill_batch(gh, dry)
