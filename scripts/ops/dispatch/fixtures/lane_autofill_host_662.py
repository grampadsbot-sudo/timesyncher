#!/usr/bin/env python3
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


def load_vkfill_held_entries():
    root = VKFILL_HELD
    if not os.path.isdir(root):
        return []
    out = []
    for name in os.listdir(root):
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as handle:
            out.append(json.load(handle))
    return out


def publish_vkfill_batch(gh, dry):
    gh.publish_calls.append(time.time())


def retire_vkfill_held_markers(gh, dry):
    held_entries = load_vkfill_held_entries()
    ls_remote_lines = git_ls_remote_lines(gh)
    for entry in held_entries:
        sha = entry.get("sha") or entry.get("publish_sha")
        branch = entry.get("branch") or entry.get("publish_branch")
        alreadypushed = entry.get("local_pushed") or entry.get("last_push_recorded")
        suffix = "alreadypushed" if alreadypushed else "held"
        entry["retire_suffix"] = suffix
    return held_entries


def main(gh, dry=False):
    retire_vkfill_held_markers(gh, dry)
    if core_remaining(gh) < 800 and not dry:
        logline("lane-autofill: skipped low GitHub quota", dry)
        return
    publish_vkfill_batch(gh, dry)
