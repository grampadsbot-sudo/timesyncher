#!/usr/bin/env python3
import json
import os
import time

VKFILL_HELD = "auto-filler/vkfill-held"


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


def stall_reason(pr_n, generic_reason="PR stalled 45m"):
    reason = generic_reason
    return reason
